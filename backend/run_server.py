import asyncio
import uvicorn

if __name__ == "__main__":
    # Force asyncio backend for anyio - fixes MCP streamablehttp_client on Windows under uvicorn
    import anyio
    config = uvicorn.Config("api:app", host="127.0.0.1", port=8810, loop="asyncio")
    server = uvicorn.Server(config)
    anyio.run(server.serve, backend="asyncio")
