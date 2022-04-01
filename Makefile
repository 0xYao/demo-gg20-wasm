wasm:
	@cd wasm && wasm-pack build --target web

dist: wasm
	@cd demo && yarn build

dist-dev: wasm
	@cd demo && yarn build:dev

module:
	@cd module && yarn build

setup: wasm module
	@cd demo && yarn install && npx playwright install
	@cd module && yarn install
	@cd snap/rpc && yarn install
	@cd snap/ui && yarn install

build:
	@cd server && cargo build

release: dist
	@cd server && cargo build --release

server: dist
	@cd server && cargo run

demo:
	@cd demo && yarn start

test-server: dist-dev
	@cd server && cargo run

test:
	@cd demo && yarn test

test-headed:
	@cd demo && yarn test-headed

lint:
	@cd demo && yarn lint

fmt: lint
	@cd demo && yarn prettier
	@cd library && cargo fmt
	@cd server && cargo fmt
	@cd wasm && cargo fmt

.PHONY: wasm dist dist-dev module setup build release server demo test lint fmt
