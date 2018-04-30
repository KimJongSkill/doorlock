"use strict";

const Router = require("koa-router");
const Hardware = require("./hardware.js")

const Rest = {
    Controllers: {},

    api: new Router({
        prefix: "/api/v1"
    }),

    get routes() {
        return Rest.api.routes();
    },

    get allowedMethods() {
        return Rest.api.allowedMethods();
    },

    Register(Component) {
        if (Component instanceof Hardware.Controller) {
            Rest.Controllers[Component.Name] = Component;
        } else {
            throw Error("Invalid arguments");
        }
    }
};

Rest.api
    // Stateless CSRF protection
    .use(async (ctx, next) => {
        if (ctx.headers.origin) {
            var Origin = ctx.headers.origin;
        } else if (ctx.headers.referer) {
            const Referer = new URL(ctx.headers.referer);

            var Origin = Referer.origin;
        }

        ctx.assert(Origin == "https://192.168.1.254"
            || Origin == "https://raspberrypi.home"
            || Origin == "https://raspberrypi", 403);

        await next();
    })
    // Save client ID
    .use(async (ctx, next) => {
        ctx.state.id = ctx.socket.getPeerCertificate().subject.CN;

        await next();
    })
    // Verify device exists
    .param("device", async (device, ctx, next) => {
        ctx.assert(Rest.Controllers[device], 404);

        await next();
    })
    // Trigger device
    .post("/:device", ctx => {
        Rest.Controllers[ctx.params.device].Open(ctx.state.id);

        ctx.status = 204;
    })
    // Query lock status
    .get("/:device/lock", ctx => {
        ctx.type = "application/json";
        ctx.body = JSON.stringify({
            status: Rest.Controllers[ctx.params.device].Locked
        });
    })
    // Set lock value
    .post("/:device/lock", async ctx => {
        try {
            const Post = await GetPost(ctx);
            const Data = JSON.parse(Post);

            ctx.assert(typeof Data.status == "boolean", 400);
            Rest.Controllers[ctx.params.device].Lock(ctx.state.id, Data.status);

            ctx.status = 204;
        } catch (error) {
            /* GetPOST() throws 413 if the request is too large,
             * otherwise assume a malformed JSON payload */
            ctx.throw(error == 413 ? 413 : 400);
        }
    });

function GetPost(ctx) {
    let Buffer = "";

    return new Promise((resolve, reject) => {
        ctx.req.on("data", chunk => {
            Buffer += chunk;

            if (Buffer.length > 16) {
                reject(413);
            }
        });
        ctx.req.on("end", () => {
            resolve(Buffer);
        });
        ctx.req.on("error", error => {
            reject(error);
        });
    });
};

module.exports = Rest;
