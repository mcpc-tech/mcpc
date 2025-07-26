import traverse from "json-schema-traverse";

export function updateRefPaths(schema: any, wrapperPath: string): any {
  // Input validation
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  if (!wrapperPath || typeof wrapperPath !== "string") {
    throw new Error("wrapperPath must be a non-empty string");
  }

  // Clone schema to avoid modifying the original object
  const clonedSchema = JSON.parse(JSON.stringify(schema));

  try {
    traverse(clonedSchema, {
      allKeys: true,
      cb: function (
        schemaNode,
        jsonPtr,
        rootSchema,
        parentJsonPtr,
        parentKeyword,
        parentSchema,
        keyIndex,
      ) {
        // Check if current node has $ref property
        if (schemaNode && typeof schemaNode === "object" && schemaNode.$ref) {
          const ref = schemaNode.$ref;

          // Handle relative path references
          if (ref.startsWith("#/properties/")) {
            const relativePath = ref.substring(13); // Remove "#/properties/"
            schemaNode.$ref =
              `#/properties/${wrapperPath}/properties/${relativePath}`;
          } // Handle root references
          else if (ref === "#") {
            schemaNode.$ref = `#/properties/${wrapperPath}`;
          }
        }
      },
    });
  } catch (error) {
    console.warn(`Failed to traverse schema for path "${wrapperPath}":`, error);
    // If traverse fails, return the original cloned schema
    return clonedSchema;
  }

  return clonedSchema;
}

// Optional: Add batch processing function
export function updateMultipleSchemas(
  schemas: Record<string, any>,
  pathPrefix: string = "",
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, schema] of Object.entries(schemas)) {
    const wrapperPath = pathPrefix ? `${pathPrefix}/${key}` : key;
    result[key] = updateRefPaths(schema, wrapperPath);
  }

  return result;
}
