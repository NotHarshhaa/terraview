# Fake GCP resources for multi-provider UI demos.

resource "google_compute_network" "main" {
  name                    = "terraview-demo-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "private" {
  name          = "terraview-demo-private"
  ip_cidr_range = "10.20.0.0/24"
  region        = "us-central1"
  network       = google_compute_network.main.id
}

resource "google_compute_instance" "app" {
  name         = "terraview-app"
  machine_type = "e2-medium"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.private.id
  }

  labels = {
    environment = "production"
    team        = "platform"
    owner       = "app-team"
  }
}

resource "google_storage_bucket" "data" {
  name     = "terraview-demo-data"
  location = "US"
}

resource "google_sql_database_instance" "postgres" {
  name             = "terraview-demo-pg"
  database_version = "POSTGRES_15"
  region           = "us-central1"

  settings {
    tier = "db-f1-micro"
  }
}

resource "google_service_account" "runner" {
  account_id   = "terraview-runner"
  display_name = "Terraview demo runner"
}
