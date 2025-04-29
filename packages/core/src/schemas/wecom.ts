import { z } from "@hono/zod-openapi";

export const WecomIncomingParamsSchema: z.ZodObject<any> = z.object({
  user: z.string().openapi({
    description: "",
  }),
  msg_type: z.string().openapi({
    example: "text",
    description: "消息类型，目前仅支持文本类型",
  }),
  content: z.string().openapi({
    example: "你好",
    description: "用户消息文本内容",
  }),
  image_base64: z.string().nullish().openapi({
    description: "图片 base64 编码, 目前仅支持纯图, 无法解析 text+image",
  }),
  msg_id: z.string().openapi({
    example: "",
    description: "用户消息ID，在异步模式下向OpenAPI发送消息时需要",
  }),
  is_fuzzy: z.number().nullish().openapi({
    example: 1,
    description: "TODO",
  }),
  fuzzy_question: z.string().nullish().openapi({
    description: "TODO",
  }),
  raw_msg: z.string().openapi({
    example: "{}",
    description: "来自企业微信的解密消息回调",
  }),
  business_keys: z.array(z.string()).openapi({
    example: ["biz_key1"],
    description: "服务标识符",
  }),
  chat_history: z.array(z.string()).nullish().openapi({
    description: "聊天历史记录",
  }),
  stream_id: z.string().nullish().openapi({
    example: "1907777970212222222223",
    description: "流ID",
  }),
  platform_robot_info: z.string().nullish().openapi({
    description: "平台机器人信息",
  }),
  space_ids: z.array(z.string()).nullish().openapi({
    description: "空间ID列表",
  }),
  doc_ids: z
    .array(z.string())
    .nullish()
    .openapi({
      example: ["401340923333"],
      description: "文档ID列表",
    }),
  source: z.string().nullish().openapi({
    example: "ai_robot",
    description: "来源",
  }),
  model_source: z.string().nullish().openapi({
    example: "ai",
    description: "模型来源",
  }),
  mapping_type: z.string().nullish().openapi({
    example: "business",
    description: "映射类型",
  }),
});

export const WecomOutgoingSchema: z.ZodString = z.string().openapi({
  description: "返回给企业微信的流式消息",
  example: `event:delta\ndata:{"response": "你好", "finished": false, "global_output":{}}\n\n`,
});

export const WecomMessageRichText: z.ZodArray<
  z.ZodObject<{
    type: z.ZodEnum<["text", "link"]>;
    text: z.ZodOptional<
      z.ZodObject<{
        content: z.ZodString;
      }>
    >;
    link: z.ZodOptional<
      z.ZodObject<{
        type: z.ZodEnum<["click", "view"]>;
        text: z.ZodString;
        key: z.ZodString;
        browser: z.ZodOptional<z.ZodNumber>;
      }>
    >;
  }>
> = z
  .array(
    z.object({
      type: z.enum(["text", "link"]).openapi({
        description: "富文本类型，可以是text或link",
      }),
      text: z
        .object({
          content: z.string().openapi({
            description: "文本内容",
          }),
        })
        .optional(),
      link: z
        .object({
          type: z.enum(["click", "view"]).openapi({
            description:
              "链接类型，click时用户点击后会回调key，view时用户点击后用浏览器打开url",
          }),
          text: z.string().openapi({
            description: "链接显示的文本",
          }),
          key: z.string().openapi({
            description: "链接URL",
          }),
          browser: z.number().optional().openapi({
            description: "浏览器打开方式，可选参数",
          }),
        })
        .optional(),
    })
  )
  .openapi({
    description: "企业微信消息的富文本内容",
    example: [
      {
        type: "text",
        text: {
          content: "Holiday Request For Pony(http://xxxxx)",
        },
      },
      {
        type: "link",
        link: {
          type: "view",
          text: "KM",
          key: "http://example.com",
          browser: 1,
        },
      },
    ],
  });
export type WecomIncomingParams = z.infer<typeof WecomIncomingParamsSchema>;
