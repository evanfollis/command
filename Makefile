.DEFAULT_GOAL := help

.PHONY: help setup check test lint typecheck build run eval deploy-check smoke browser-smoke release-test runtime-setup service-install

help: ## Show the supported repository commands.
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install lockfile-pinned Node dependencies.
	npm ci

check: ## Run the complete deterministic pre-merge gate.
	npm run check

test: ## Run deterministic contract tests.
	npm test

lint: ## Run static pattern and product-boundary checks.
	npm run lint

typecheck: ## Type-check the Next application and custom server.
	npm run typecheck

build: ## Build a secret-scanned immutable-release candidate.
	npm run build

run: ## Start the local development server.
	npm run dev

eval: ## Check prompt inventories and accepted baselines.
	npm run eval:check

deploy-check: ## Verify release, eval, and rollback inputs without deploying.
	npm run deploy:check

smoke: ## Exercise the live authenticated HTTP surface.
	npm run smoke

browser-smoke: ## Exercise the live authenticated Chromium surface.
	npm run browser:smoke

release-test: ## Verify immutable release and rollback invariants.
	npm run release:test

runtime-setup: ## Install the checksum-pinned supported Node LTS runtime.
	npm run runtime:setup

service-install: ## Canary and install the versioned systemd hardening policy.
	npm run service:install
