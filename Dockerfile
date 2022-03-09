FROM rust:1.57-buster AS rust

FROM debian:bullseye AS builder
WORKDIR /usr/app

# CLANG
RUN apt-get update
RUN apt-get install -y wget build-essential libssl-dev

RUN printf "deb http://apt.llvm.org/bullseye/ llvm-toolchain-bullseye main\ndeb-src http://apt.llvm.org/bullseye/ llvm-toolchain-bullseye main\ndeb http://apt.llvm.org/bullseye/ llvm-toolchain-bullseye-12 main\ndeb-src http://apt.llvm.org/bullseye/ llvm-toolchain-bullseye-12 main" >> /etc/apt/sources.list

RUN wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add -
RUN apt-get update
RUN apt-get install -y clang-12
RUN ln -s /usr/bin/clang-12 /usr/bin/clang
RUN clang --version

COPY --from=rust /usr/local/cargo /usr/local/cargo
ENV PATH=/usr/local/cargo/bin:$PATH

# SERVER
COPY common common
COPY server server
RUN rustup override set nightly-2021-08-12
RUN cargo install --path ./server
RUN cargo install --version 0.10.1 wasm-pack
RUN mv ~/.cargo/bin/* /usr/bin
RUN mpc-websocket --version
RUN wasm-pack --version

# WASM
COPY wasm wasm
RUN rustup component add rust-src --toolchain nightly-2021-08-12-x86_64-unknown-linux-gnu;
RUN cd wasm && wasm-pack build --target web;

# CLIENT
FROM node:14 AS client
WORKDIR /usr/app
COPY client client
COPY --from=builder /usr/app/wasm /usr/app/wasm
RUN cd client && yarn install && yarn build

FROM debian:bullseye AS runner
WORKDIR /usr/app
COPY --from=builder /usr/bin/mpc-websocket /usr/bin/mpc-websocket
COPY --from=client /usr/app/client/dist /usr/app/client/dist
CMD mpc-websocket --bind 0.0.0.0:8080 client/dist
