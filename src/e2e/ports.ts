import { createServer } from "node:net";

export async function getLoopbackPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Unable to allocate test port")));
				return;
			}
			const { port } = address;
			server.close((err) => {
				if (err) reject(err);
				else resolve(port);
			});
		});
	});
}
