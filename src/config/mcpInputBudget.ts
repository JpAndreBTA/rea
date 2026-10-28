import { positiveDecimalIntegerSchema } from "./positiveDecimalInteger.js";
import { ConfigurationError } from "../domain/configurationErrors.js";
import { err, ok, type Result } from "../domain/result.js";

/** Per-call MCP admission policy, not a byte or heap-size guarantee.
 * 65,537 scalar failures on the pinned canonical bundle schema add about
 * 43 MiB of heap before SDK formatting. Bound this expansion before parsing;
 * operators may select a different finite allowance for their workload.
 */
export const DEFAULT_MCP_MAX_INPUT_ELEMENTS = 65_536;

const setting = "REA_MCP_MAX_INPUT_ELEMENTS";
const constraint = `${setting} must be a positive decimal safe integer counting combined array elements and object members; the default is ${String(DEFAULT_MCP_MAX_INPUT_ELEMENTS)}.`;

export const mcpInputBudgetSchema = positiveDecimalIntegerSchema(
  1,
  Number.MAX_SAFE_INTEGER,
  constraint,
);

/** Invalid resource settings fail explicitly rather than disabling admission. */
export const parseMcpInputBudget = (
  value: string | undefined,
): Result<number, ConfigurationError> => {
  if (value === undefined) return ok(DEFAULT_MCP_MAX_INPUT_ELEMENTS);
  const parsed = mcpInputBudgetSchema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err(
        new ConfigurationError(constraint, {
          settings: [{ setting, constraint }],
        }),
      );
};
