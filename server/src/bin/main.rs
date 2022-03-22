use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;
use clap::Parser;

use mpc_websocket::{Result, Server};

#[derive(Debug, Parser)]
#[clap(
    name = "mpc-websocket",
    about = "Websocket server for MPC key generation and signing"
)]
struct Options {
    /// Bind to host:port.
    #[structopt(short, long)]
    bind: Option<String>,
    /// Path to static files to serve
    #[structopt(parse(from_os_str))]
    files: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let opts: Options = Parser::parse();
    let bind = opts.bind.unwrap_or_else(|| "127.0.0.1:3030".to_string());
    let addr = SocketAddr::from_str(&bind)?;
    Server::start("mpc", (addr.ip(), addr.port()), opts.files).await
}
