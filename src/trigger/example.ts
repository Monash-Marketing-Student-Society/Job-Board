import { logger, task, wait } from "@trigger.dev/sdk";

export type HelloWorldPayload = {
  name?: string;
};

export const helloWorldTask = task({
  id: "hello-world",
  // Stop executing after 300 secs (5 mins) of compute
  maxDuration: 300,
  run: async (payload: HelloWorldPayload, { ctx }) => {
    logger.log("Hello, world!", { payload, ctx });

    await wait.for({ seconds: 5 });

    return {
      message: `Hello, ${payload.name ?? "world"}!`,
    };
  },
});
