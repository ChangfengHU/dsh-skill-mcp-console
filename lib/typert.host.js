// src/wire.ts
import { z } from "zod";
var PKG = "dsh-skill-mcp";
function jsonParam(name) {
  return Object.freeze({
    name,
    wire: name,
    source: "json",
    codec: Object.freeze({ mode: "strict", typeSymbol: `${PKG}/types#Json`, schema: z.string() })
  });
}
var JSON_RESULT = Object.freeze({ mode: "strict", typeSymbol: `${PKG}/types#Json`, schema: z.string() });
function descriptor(method, argc) {
  return Object.freeze({
    id: `${PKG}#skillMcp/${method}`,
    service: "skillMcp",
    namespace: "skillMcp",
    method,
    invocation: Object.freeze({ kind: "direct" }),
    parameters: Object.freeze(argc === 1 ? [jsonParam("payload")] : []),
    result: JSON_RESULT,
    sourceLocation: Object.freeze({ file: "src/wire.ts", line: 1, column: 1 })
  });
}
var METHODS = [
  ["skills", 0],
  ["skillFile", 1],
  ["setSkillState", 1],
  ["removeSkill", 1],
  ["mcp", 0],
  ["mcpJson", 0],
  ["saveMcpJson", 1],
  ["setMcpDisabled", 1],
  ["setToolDisabled", 1],
  ["detectInstall", 1],
  ["peekInstall", 1],
  ["stageInstall", 1],
  ["runInstall", 1],
  ["createSkill", 1],
  ["uploadSkill", 1],
  ["directory", 1],
  ["repoReadme", 1]
];
var CONSOLE_INVOCATIONS = Object.freeze(METHODS.map(([method, argc]) => descriptor(method, argc)));

// src/typert.host.ts
var TYPERT = Object.freeze({
  package: PKG,
  face: "host",
  schemas: Object.freeze([]),
  invocations: CONSOLE_INVOCATIONS,
  model: Object.freeze({
    services: Object.freeze([]),
    events: Object.freeze([]),
    objects: Object.freeze([])
  })
});
export {
  TYPERT
};
