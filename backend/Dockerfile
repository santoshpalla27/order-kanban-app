# Build stage — no CGO needed (pure-Go postgres driver, no sqlite)
FROM golang:1.24-alpine AS builder

ENV GOTOOLCHAIN=auto

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0: fully static binary, no gcc, no musl-dev required
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/main.go

# Runtime stage — distroless for minimal attack surface
FROM gcr.io/distroless/static-debian12

WORKDIR /app

COPY --from=builder /app/server .

EXPOSE 8080

CMD ["./server"]
