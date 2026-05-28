# Sample project used to drive the Terraview demo. Pair with the
# checked-in terraform.tfstate next to this file:
#
#   go run ./cmd/terraview serve ./testdata/sample-project
#
# Everything below is intentionally fake — no providers initialised, no
# real cloud calls. The only goal is to exercise the HCL autodiscovery,
# state parser, classifier and categorizer end-to-end.

terraform {
  required_version = ">= 1.0"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name        = "demo-vpc"
    Environment = "production"
    Team        = "platform"
    Owner       = "infra"
  }
}

resource "aws_subnet" "private_a" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_security_group" "alb" {
  name        = "alb"
  description = "demo alb sg"
  vpc_id      = aws_vpc.main.id
}

resource "aws_instance" "web_server" {
  ami           = "ami-0abcdef1234567890"
  instance_type = "t3.medium"
  subnet_id     = aws_subnet.private_a.id

  tags = {
    Name        = "web-server"
    role        = "web"
    Environment = "production"
    Team        = "platform"
    Owner       = "app-team"
  }
}

resource "aws_instance" "bastion" {
  ami           = "ami-0abcdef1234567890"
  instance_type = "t2.micro"

  tags = {
    Name        = "bastion"
    Environment = "production"
    Team        = "platform"
    Owner       = "infra"
  }
}

resource "aws_rds_instance" "postgres" {
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.medium"
  allocated_storage = 20
}

resource "aws_s3_bucket" "assets" {
  bucket = "terraview-demo-assets"
}

resource "aws_iam_role" "ec2" {
  name = "ec2-role"
}

resource "aws_lambda_function" "image_resize" {
  function_name = "image-resize"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
}
