import { cronJobs } from "convex/server";

import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval("run-auto-pipeline", { minutes: 3 }, api.pipeline.runAutoPipeline);

export default crons;
