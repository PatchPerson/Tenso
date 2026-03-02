FROM rust:1.82-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY shared/ shared/
COPY sync-server/ sync-server/
# Build only the sync-server
RUN cargo build --release -p reqlite-sync-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/reqlite-sync-server /usr/local/bin/
EXPOSE 3000
ENV DATABASE_PATH=/data/reqlite-sync.db
ENV JWT_SECRET=change-me-in-production
VOLUME ["/data"]
CMD ["reqlite-sync-server"]
