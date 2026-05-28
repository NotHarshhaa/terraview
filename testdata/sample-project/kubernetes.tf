# Fake Kubernetes resources for multi-provider UI demos.

resource "kubernetes_namespace" "app" {
  metadata {
    name = "terraview-app"
    labels = {
      environment = "staging"
      team        = "platform"
      owner       = "app-team"
    }
  }
}

resource "kubernetes_deployment" "api" {
  metadata {
    name      = "api"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "api"
      }
    }

    template {
      metadata {
        labels = {
          app = "api"
        }
      }

      spec {
        container {
          name  = "api"
          image = "ghcr.io/notharshhaa/terraview:latest"
        }
      }
    }
  }
}

resource "kubernetes_service" "api" {
  metadata {
    name      = "api"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  spec {
    selector = {
      app = "api"
    }

    port {
      port = 80
    }
  }
}
