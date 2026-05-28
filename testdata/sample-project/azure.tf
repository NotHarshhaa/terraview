# Fake Azure resources for multi-provider UI demos.

resource "azurerm_resource_group" "core" {
  name     = "terraview-demo-rg"
  location = "East US"

  tags = {
    Environment = "staging"
    Team        = "platform"
    Owner       = "infra"
  }
}

resource "azurerm_virtual_network" "main" {
  name                = "terraview-demo-vnet"
  address_space       = ["10.30.0.0/16"]
  location            = azurerm_resource_group.core.location
  resource_group_name = azurerm_resource_group.core.name
}

resource "azurerm_subnet" "app" {
  name                 = "app"
  resource_group_name  = azurerm_resource_group.core.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.30.1.0/24"]
}

resource "azurerm_linux_virtual_machine" "web" {
  name                = "terraview-web"
  resource_group_name = azurerm_resource_group.core.name
  location            = azurerm_resource_group.core.location
  size                = "Standard_B1s"
  admin_username      = "adminuser"

  network_interface_ids = []

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }

  tags = {
    Environment = "staging"
    Team        = "web"
    Owner       = "app-team"
  }
}

resource "azurerm_storage_account" "logs" {
  name                     = "terraviewdemologs"
  resource_group_name      = azurerm_resource_group.core.name
  location                 = azurerm_resource_group.core.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_postgresql_flexible_server" "db" {
  name                = "terraview-demo-pg"
  resource_group_name = azurerm_resource_group.core.name
  location            = azurerm_resource_group.core.location
  version             = "15"
  sku_name            = "B_Standard_B1ms"
  storage_mb          = 32768
}
