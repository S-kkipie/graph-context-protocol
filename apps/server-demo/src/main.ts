import { run } from "./app";

run().then((report) => {
    process.stdout.write(`${report}\n`);
});
