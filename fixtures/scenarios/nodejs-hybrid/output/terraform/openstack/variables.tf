variable "namespace" {
  type    = string
  default = "stratosphere-migration"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "auth_url" {
  type = string
}
variable "tenant_name" {
  type = string
}
variable "user_name" {
  type = string
}
variable "password" {
  type = string
  sensitive = true
}
