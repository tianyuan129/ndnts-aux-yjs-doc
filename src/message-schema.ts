import Ajv from "ajv"

const messageSchema = {
    "title": "Message",
    "description": "Generic message",
    "type": "object",
    "properties": {
      "kind": {
        "description": "The type of message",
        "type": "string",
        "enum": [
          "History",
          "HistoryFinish",
          "CreateObjectRequest",
          "CreateObject",
          "DestroyObjectRequest",
          "DestroyObject",
          "NetworkVariableAssignment",
          "TransformUpdate",
          "Response"
        ]
      },
      "objectId": {
        "description": "Global unique ID of the an Object",
        "type": "string",
        "$comment": "We may also need Behavior ID?"
      },
      "assetId": {
        "description": "Used to specify the Assets when creating objects",
        "type": "string"
      },
      "parent": {
        "description": "The parent ID of the object",
        "type": "string"
      },
      "variableName": {
        "description": "The variable to assign",
        "type": "string"
      },
      "value": {
        "description": "The value of the variable. Use a number array if it is a vector or matrix.",
        "type": ["string", "boolean", "number", "object", "array"]
      },
      "result": {
        "description": "The result code of the response",
        "type": "number"
      }
    },
    "required": ["kind"],
    "allOf": [
      {
        "if": {
          "properties": {
            "kind": {
              "enum": ["CreateObjectRequest", "Response", "History", "HistoryFinish"]
            }
          }
        },
        "else": {
          "required": ["objectId"]
        }
      },
      {
        "if": {
          "properties": {
            "kind": {
              "enum": ["CreateObjectRequest", "CreateObject"]
            }
          }
        },
        "then": {
          "required": ["assetId"]
        }
      },
      {
        "if": {
          "properties": {
            "kind": {
              "const": "Response"
            }
          }
        },
        "then": {
          "required": ["result"]
        }
      }
    ]
}
const ajv = new Ajv({allowUnionTypes: true})
export const schemaValidate = ajv.compile(messageSchema)


const messageSchema2 =
{
  "type": "object",
  "properties": {
      "type": {
          "type": "string",
          "enum": ["create", "create_response", "update", "update_response", "parent", "parent_response", "update_parent"]
      },
      "content": {
          "type": "object",
          "properties": {
              "id": {"type": "string"},
              "uuid": {"type": "string"},
              "parent": {"type": "string"},
              "pos": {
                  "type": "object",
                  "properties": {
                      "x": {"type": "number"},
                      "y": {"type": "number"},
                      "z": {"type": "number"}
                  },
                  "additionalProperties": false
              }
          },
          "required": ["id", "uuid"],
          "additionalProperties": true
      }
  },
  "required": ["type", "content"],
  "additionalProperties": false,
  "allOf": [
      {
          "if": {
              "properties": {"type": {"enum": ["parent", "parent_response"]}}
          },
          "then": {
              "properties": {
                  "content": {
                      "required": ["parent"],
                      "not": { "required": ["pos"] }
                  }
              }
          }
      },
      {
          "if": {
              "properties": {"type": {"enum": ["update", "update_response"]}}
          },
          "then": {
              "properties": {
                  "content": {
                      "required": ["pos"],
                      "not": { "required": ["parent"] }
                  }
              }
          }
      }
  ]
}
export const schemaValidate2 = ajv.compile(messageSchema2)