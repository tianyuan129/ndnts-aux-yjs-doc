import socket
import json
from jsonschema import validate
from jsonschema.exceptions import ValidationError
import time

def process_data(data):
    # Define the JSON schema for message validation
    json_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
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
                        "additionalProperties": False
                    }
                },
                "required": ["id", "uuid"],
                "additionalProperties": True
            }
        },
        "required": ["type", "content"],
        "additionalProperties": False,
        "allOf": [
            {
                # Apply rules for 'parent' and 'parent_response' types
                "if": {
                    "properties": {"type": {"enum": ["parent", "parent_response"]}}
                },
                "then": {
                    "properties": {
                        "content": {
                            "required": ["parent"],
                            "not": {
                                "properties": {
                                    "pos": {
                                        "additionalProperties": True
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                # Apply rules for 'update' and 'update_response' types
                "if": {
                    "properties": {"type": {"enum": ["update", "update_response"]}}
                },
                "then": {
                    "properties": {
                        "content": {
                            "required": ["pos"],
                            "not": {
                                "properties": {
                                    "parent": {
                                        "additionalProperties": True
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]
    }

    try:
        # Validate the message against the schema
        validate(instance=data, schema=json_schema)
        print(f"Validated message: {data}")
        return True  # Indicate successful validation
    except ValidationError as ve:
        print(f"Message failed validation: {ve}")
        return False  # Indicate failed validation
    except json.JSONDecodeError:
        print("Failed to decode JSON")
        return False  # Indicate failed JSON decoding

def start_server(port=6666):
    host = ''  # Symbolic name meaning all available interfaces
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind((host, port))
    s.listen(1)
    print(f"Server listening on port {port}")
    conn, addr = s.accept()
    print('Connected by', addr)

    try:
        while True:
            data = conn.recv(1024)
            print(data)
            if not data:
                break
            try:
                decoded_data = json.loads(data.decode('utf-8'))
                if decoded_data["type"] == "create":
                    decoded_data["content"]["uuid"]="1"
                decoded_data["type"] = decoded_data["type"] + "_response"
                if 1==1:
                #if process_data(decoded_data):
                    response_data = json.dumps(decoded_data)
                    # Encode the JSON string to UTF-8 bytes
                    response_bytes = response_data.encode('utf-8')
                    # Send the modified and re-encoded data
                    conn.sendall(response_bytes)
                    break
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON: {e}")
                break
    except:
        print(123)
    finally:
        #time.sleep(5)
        conn.close()

if __name__ == "__main__":
    start_server()