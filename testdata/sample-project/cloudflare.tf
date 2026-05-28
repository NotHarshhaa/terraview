# Fake Cloudflare resources for additional provider coverage in the UI.

resource "cloudflare_zone" "main" {
  zone = "terraview-demo.example"
}

resource "cloudflare_record" "www" {
  zone_id = cloudflare_zone.main.id
  name    = "www"
  value   = "203.0.113.10"
  type    = "A"
  proxied = true
}
