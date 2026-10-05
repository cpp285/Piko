import { z } from "zod";

export const ApprovalFieldSchema = z.object({
  key: z.string().max(200), label: z.string().max(2000), description: z.string().max(8000).optional(),
  type: z.enum(["string", "number", "integer", "boolean"]), required: z.boolean(),
  choices: z.array(z.object({ value: z.string(), label: z.string() })).max(50).optional(),
  min: z.number().optional(), max: z.number().optional(), maxLength: z.number().optional(),
});
export type ApprovalField = z.infer<typeof ApprovalFieldSchema>;
export const ApprovalValuesSchema = z.record(z.union([z.string().max(24000), z.number().finite(), z.boolean()]));
export type ApprovalValues = z.infer<typeof ApprovalValuesSchema>;

/** Deliberately excludes password/URL flows and nested or unknown form contracts. */
export function approvalFields(schema: any): ApprovalField[] {
  if (schema?.type !== "object" || !schema.properties || typeof schema.properties !== "object") throw new Error("Unsupported approval form");
  if (Object.keys(schema.properties).length > 20) throw new Error("Approval form is too large");
  return Object.entries(schema.properties).map(([key, value]) => {
    const field = value as any;
    if (field.format || field.pattern || field.anyOf || field.allOf || field.$ref) throw new Error("Unsupported approval field");
    const choices = field.enum?.map((value: unknown, index: number) => {
      if (typeof value !== "string") throw new Error("Unsupported approval choice");
      return { value, label: field.enumNames?.[index] || value };
    }) || field.oneOf?.map((option: any) => {
      if (typeof option.const !== "string") throw new Error("Unsupported approval choice");
      return { value: option.const, label: option.title || option.const };
    });
    return ApprovalFieldSchema.parse({ key, label: field.title || key, description: field.description,
      type: field.type || (choices ? "string" : undefined), required: schema.required?.includes(key) || false,
      choices, min: field.minimum, max: field.maximum, maxLength: field.maxLength });
  });
}

export function validateApprovalValues(fields: ApprovalField[], values: ApprovalValues): ApprovalValues {
  const result: ApprovalValues = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === "") {
      if (field.required) throw new Error(`请填写「${field.label}」`);
      continue;
    }
    if (typeof value !== (field.type === "integer" ? "number" : field.type)) throw new Error(`「${field.label}」格式不正确`);
    if (field.choices && !field.choices.some(choice => choice.value === value)) throw new Error(`请重新选择「${field.label}」`);
    if (typeof value === "number" && (!Number.isFinite(value) || (field.type === "integer" && !Number.isInteger(value)) || (field.min != null && value < field.min) || (field.max != null && value > field.max))) throw new Error(`「${field.label}」超出范围`);
    if (typeof value === "string" && value.length > (field.maxLength ?? 24000)) throw new Error(`「${field.label}」过长`);
    Object.defineProperty(result, field.key, { value, enumerable: true });
  }
  return result;
}
