"use strict";

const config = require("./config.json");

const path = require("path");
const fs = require("fs");
const Koa = require("koa");
const serve = require("koa-static");
const mount = require("koa-mount");
const ms = require("ms");
const logger = require("./logger.js");
const hardware = require("./hardware.js");

const Door = new hardware.Controller("door", 12);
const Gate = new hardware.Controller("gate", 22);
const GPIO = new hardware.Monitor("gpio input", 26, Name => Door.Open(Name));

const HttpsOptions = {
	key:  fs.readFileSync(path.join(__dirname, config.credentials.key )),
	cert: fs.readFileSync(path.join(__dirname, config.credentials.cert)),
	ca:   fs.readFileSync(path.join(__dirname, config.credentials.ca  )),
	requestCert: true,
	rejectUnauthorized: true
};

const App = new Koa();
const Server = require("http2").createSecureServer(HttpsOptions, App.callback());

const compress = require("koa-compress");
App.use(compress());

const helmet = require("koa-helmet");
App.use(helmet({
	frameguard: {
		action: "deny"
	},
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'none'"],
			styleSrc: ["'self'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'"],
			manifestSrc: ["'self'"],
			connectSrc: ["'self'"],
			blockAllMixedContent: true
		}
	}
}));

const Api = require("./api.js");
App.use(Api.routes);
App.use(Api.allowedMethods);

const SSE = require("./sse");
const EventManager = new SSE();
App.use(mount("/sse", EventManager.SSE));

function RegisterComponent(Component) {
	Api.Register(Component);

	Component.on("open", () => {
		EventManager.Broadcast("message", `${ Component.Name } opened`);
	});
	Component.on("lock", Value => {
		EventManager.Broadcast(`${ Component.Name }_status`, JSON.stringify(Value));
	});

	EventManager.on("client", Client => {
		Client.Send(`${ Component.Name }_status`, JSON.stringify(Component.Locked));
	});
};

RegisterComponent(Door);
RegisterComponent(Gate);

App.use(serve(path.join(__dirname, "public", "www"), { maxAge: ms("7d"), gzip: false, brotli: false }));
App.use(serve(path.join(__dirname, "node_modules", "material-components-web", "dist"), { maxAge: ms("7d"), immutable: true, gzip: false, brotli: false }));
App.use(mount("/ca", serve(path.join(__dirname, "public", "ca"), { maxAge: ms("28d"), immutable: true, gzip: false, brotli: false })));

Server.listen(config.server.port, config.server.ip, () =>
	logger.Info("HTTP/2", "listening on port", config.server.port));
