# frozen_string_literal: true

# NovaMail admin sidecar for Postal.
#
# Postal has no management API (only its web UI), so this tiny JSON service runs
# inside the official Postal image, loads the Rails environment and uses Postal's
# own models. That way DKIM keys, message databases, webhooks and validations are
# created exactly as the Postal UI would create them.
#
# Started with:  bundle exec rails runner /novamail-admin/server.rb
# Listens on 127.0.0.1:${NOVAMAIL_ADMIN_PORT:-5050}; Caddy exposes it at /_novamail/*.
# Every request must carry `Authorization: Bearer $NOVAMAIL_ADMIN_TOKEN`.

require "json"
require "rack"
require "puma"
require "puma/configuration"
require "puma/launcher"

module NovaMailAdmin
  TOKEN = ENV.fetch("NOVAMAIL_ADMIN_TOKEN")
  raise "NOVAMAIL_ADMIN_TOKEN must be at least 32 characters" if TOKEN.length < 32

  SYSTEM_EMAIL = ENV.fetch("NOVAMAIL_SYSTEM_USER", "system@novamail.invalid")

  class HttpError < StandardError
    attr_reader :status

    def initialize(status, message)
      super(message)
      @status = status
    end
  end

  module_function

  def system_user
    User.find_by(email_address: SYSTEM_EMAIL) ||
      User.create!(email_address: SYSTEM_EMAIL, first_name: "NovaMail", last_name: "System",
                   password: SecureRandom.hex(32), admin: true, email_verified_at: Time.now)
  end

  def org!(permalink)
    Organization.present.find_by(permalink: permalink) || raise(HttpError.new(404, "organization #{permalink} not found"))
  end

  def server!(org, permalink)
    org.servers.present.find_by(permalink: permalink) || raise(HttpError.new(404, "server #{permalink} not found"))
  end

  def apply_pool(org, server, pool_name)
    return unless Postal::Config.postal.use_ip_pools?

    pool = IPPool.find_by(name: pool_name)
    return unless pool

    org.ip_pools << pool unless org.ip_pools.include?(pool)
    server.update!(ip_pool: pool)
  end

  def records_for(domain)
    dns = Postal::Config.dns
    recs = []
    unless domain.verified?
      recs << { record: "verification", type: "TXT", name: domain.name, value: domain.dns_verification_string, required: true }
    end
    recs << { record: "spf", type: "TXT", name: domain.name, value: domain.spf_record, required: true }
    recs << { record: "dkim", type: "TXT", name: "#{domain.dkim_record_name}.#{domain.name}", value: domain.dkim_record, required: true }
    recs << { record: "return_path", type: "CNAME", name: domain.return_path_domain, value: dns.return_path_domain, required: false }
    recs
  end

  # ---- actions ----

  def provision(b)
    permalink = b.fetch("account_id").to_s.downcase.gsub(/[^a-z0-9-]/, "-")[0, 60]
    org = Organization.present.find_by(permalink: permalink)
    ActiveRecord::Base.transaction do
      org ||= Organization.create!(name: b.fetch("name")[0, 100], permalink: permalink, owner: system_user)
    end
    server = org.servers.present.find_by(permalink: "main") ||
             org.servers.create!(name: "main", permalink: "main", mode: "Live")
    server.update!(send_limit: b["hourly_limit"]) if b["hourly_limit"]
    apply_pool(org, server, b["ip_pool"]) if b["ip_pool"]

    api = server.credentials.where(type: "API", name: "novamail-api").first ||
          server.credentials.create!(type: "API", name: "novamail-api")
    smtp = server.credentials.create!(type: "SMTP", name: "smtp-#{Time.now.utc.strftime('%Y%m%d%H%M%S')}")

    if b["webhook_url"]
      hook = server.webhooks.find_by(name: "novamail") || server.webhooks.build(name: "novamail")
      hook.update!(url: b["webhook_url"], all_events: true, enabled: true, sign: true)
    end

    { org: org.permalink, server: server.permalink, api_key: api.key,
      smtp_username: "#{org.permalink}/#{server.permalink}", smtp_password: smtp.key }
  end

  def limits(b)
    org = org!(b.fetch("org"))
    server = server!(org, b.fetch("server"))
    server.update!(send_limit: b["hourly_limit"]) if b.key?("hourly_limit")
    apply_pool(org, server, b["ip_pool"]) if b["ip_pool"]
    {}
  end

  def suspend(b)
    org!(b.fetch("org")).update!(suspended_at: Time.now, suspension_reason: b["reason"].to_s[0, 250])
    {}
  end

  def unsuspend(b)
    org!(b.fetch("org")).update!(suspended_at: nil, suspension_reason: nil)
    {}
  end

  def domain_add(b)
    server = server!(org!(b.fetch("org")), b.fetch("server"))
    name = b.fetch("name").to_s.downcase.strip
    domain = server.domains.find_by(name: name) || server.domains.create!(name: name, verification_method: "DNS")
    { uuid: domain.uuid, records: records_for(domain) }
  end

  def domain_check(b)
    server = server!(org!(b.fetch("org")), b.fetch("server"))
    domain = server.domains.find_by(uuid: b.fetch("uuid")) || raise(HttpError.new(404, "domain not found"))
    domain.verify_with_dns unless domain.verified?
    domain.check_dns(:manual) if domain.verified?
    domain.reload
    { verified: domain.verified?, dns_ok: domain.verified? && domain.dns_ok?,
      checks: { spf: domain.spf_status, spf_error: domain.spf_error, dkim: domain.dkim_status, dkim_error: domain.dkim_error,
                return_path: domain.return_path_status, mx: domain.mx_status },
      records: records_for(domain) }
  end

  def domain_remove(b)
    server = server!(org!(b.fetch("org")), b.fetch("server"))
    server.domains.find_by(uuid: b.fetch("uuid"))&.destroy!
    {}
  end

  # Inbound address for feedback-loop (ARF) complaint reports. Mail sent to it is POSTed
  # (signed, raw message) to the control plane, which suppresses the complainer.
  def fbl_route(b)
    server = server!(org!(b.fetch("org")), b.fetch("server"))
    ep = server.http_endpoints.find_by(name: "novamail-fbl") || server.http_endpoints.build(name: "novamail-fbl")
    ep.update!(url: b.fetch("url"), encoding: "BodyAsJSON", format: "RawMessage", include_attachments: true, timeout: 10)
    domain = server.domains.find_by(name: b.fetch("domain").to_s.downcase) || raise(HttpError.new(404, "domain not found"))
    route = server.routes.find_by(name: "fbl", domain: domain) || server.routes.build(name: "fbl", domain: domain)
    route.update!(mode: "Endpoint", endpoint: ep, spam_mode: "Mark")
    { address: "fbl@#{domain.name}", forward_address: route.forward_address }
  end

  ROUTES = {
    "/v1/provision" => :provision,
    "/v1/limits" => :limits,
    "/v1/suspend" => :suspend,
    "/v1/unsuspend" => :unsuspend,
    "/v1/domains/add" => :domain_add,
    "/v1/domains/check" => :domain_check,
    "/v1/domains/remove" => :domain_remove,
    "/v1/fbl" => :fbl_route,
  }.freeze

  def json(status, body)
    [status, { "content-type" => "application/json", "cache-control" => "no-store" }, [JSON.generate(body)]]
  end

  def call(env)
    req = Rack::Request.new(env)
    return json(200, { ok: true, postal: Postal.version }) if req.get? && req.path_info == "/health"

    auth = env["HTTP_AUTHORIZATION"].to_s
    unless auth.start_with?("Bearer ") && Rack::Utils.secure_compare(auth.delete_prefix("Bearer "), TOKEN)
      return json(401, { ok: false, error: "unauthorized" })
    end

    action = ROUTES[req.path_info]
    return json(404, { ok: false, error: "no route" }) unless action && req.post?

    body = JSON.parse(req.body.read.presence || "{}")
    result = ActiveRecord::Base.connection_pool.with_connection { send(action, body) }
    Rails.logger&.info("novamail-admin #{action} ok")
    json(200, { ok: true }.merge(result))
  rescue HttpError => e
    json(e.status, { ok: false, error: e.message })
  rescue KeyError, JSON::ParserError => e
    json(422, { ok: false, error: e.message })
  rescue ActiveRecord::RecordInvalid => e
    json(422, { ok: false, error: e.record.errors.full_messages.join(", ") })
  rescue StandardError => e
    warn "novamail-admin error: #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}"
    json(500, { ok: false, error: "internal error" })
  end
end

unless ENV["NOVAMAIL_ADMIN_NO_SERVER"] == "1"
  port = Integer(ENV.fetch("NOVAMAIL_ADMIN_PORT", "5050"))
  conf = Puma::Configuration.new do |c|
    c.bind "tcp://127.0.0.1:#{port}"
    c.threads 1, 4
    c.workers 0
    c.app NovaMailAdmin
    c.log_requests false
  end
  Puma::Launcher.new(conf).run
end
