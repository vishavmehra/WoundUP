// A classic script that index.html runs before the game's module graph, so it applies before any library builds a zod schema.
//
// zod (a dependency of IWSDK and uikit, not used by the game itself) compiles a faster parser with `new Function`, and first probes
// whether that is allowed. Under the Content-Security-Policy in vercel.json (no 'unsafe-eval') the probe fails by design, but Chrome
// still reports the caught attempt as a `securitypolicyviolation`. zod reads its global config from `globalThis.__zod_globalConfig`
// and skips the probe when `jitless` is set (node_modules/zod/v4/core/util.js, allowsEval), at the cost of the slower plain parser,
// which the few schemas built at start-up do not notice. It cannot be a module imported from src/index.ts: the bundler runs the
// shared library chunk before the entry chunk's own body. tests/csp/csp.spec.ts fails on any violation.
(globalThis.__zod_globalConfig ??= {}).jitless = true;
