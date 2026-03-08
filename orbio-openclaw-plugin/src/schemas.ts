import { Type, type Static } from "@sinclair/typebox";

export const SearchToolInput = Type.Object(
  {
    query_text: Type.String({ minLength: 1, maxLength: 500 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50000 })),
    with_contact: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export type SearchToolInput = Static<typeof SearchToolInput>;

export const ExportToolInput = Type.Object(
  {
    query_text: Type.String({ minLength: 1, maxLength: 500 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50000 })),
    format: Type.Optional(Type.Union([Type.Literal("csv"), Type.Literal("html")])),
    with_contact: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export type ExportToolInput = Static<typeof ExportToolInput>;

export const ExportStatusToolInput = Type.Object(
  {
    export_id: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export type ExportStatusToolInput = Static<typeof ExportStatusToolInput>;

export const CommandToolInput = Type.Object(
  {
    command: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    command_arg: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    commandArg: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    command_name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    commandName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    skill_name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    skillName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  { additionalProperties: true },
);

export type CommandToolInput = Static<typeof CommandToolInput>;
