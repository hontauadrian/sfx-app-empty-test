# §11.12 — Per upload / download surface

> Decision 11.12: Upload endpoints require happy + MIME + size +
> malformed + multi-file. Download endpoints require content-type +
> content-disposition + range (when declared).

## The rule (verbatim from Decision 11.12)

- ☐ Happy multipart upload.
- ☐ MIME validation (wrong content-type → 415).
- ☐ Size limit (over max → 413).
- ☐ Malformed multipart (boundary missing / truncated → 400).
- ☐ Multiple-file array.
- ☐ Binary download (assert content-type + content-disposition).
- ☐ Range request (`Range` header → 206 Partial Content) where
      applicable.

## Decision 17 P0-3 — multipart body kind

The schema supports multipart via `"bodyKind": "multipart"` and
`"multipart": [{ "name", "value", "file": { "fixtureRef", "mimeType",
"filename" } }]`. Fixtures live in `_shared.json` under `fixtures` and
resolve to file paths the runner reads.

## Failure mode if missing

| Missing | Bug that ships |
|---|---|
| MIME validation | A `text/plain` upload masquerading as `image/png` is accepted; downstream image-processing service crashes. The probe never sent a wrong-MIME upload. |
| Size limit | A 1GB upload to a 1MB endpoint is accepted; the API server runs out of memory mid-request and OOM-kills. |
| Malformed multipart | A truncated body causes a 500 (server crash) instead of declared 400. |
| Range request | A 5-byte download instead of declared 206 partial content; client (video player) freezes waiting for content. |

## JSON patterns

### Pattern 1 — happy multipart upload

Declare the fixture once at file scope; reference by name from the
flow's multipart parts.

```json
{
  "fixtures": {
    "small-png": {
      "path": "<test-fixtures-dir>/small.png",
      "mimeType": "image/png"
    }
  }
}
```

```json
{
  "id": "<task-id>:<upload-endpoint>-happy",
  "description": "Multipart upload of an image returns 201 + URL",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<upload-path>",
        "bodyKind": "multipart",
        "multipart": [
          { "name": "file",  "file": { "fixtureRef": "small-png" } },
          { "name": "title", "value": "<title-value>" }
        ]
      },
      "expect": {
        "status": 201,
        "jsonpath": {
          "$.url": { "matches": "^https?://" },
          "$.mimeType": "image/png"
        }
      }
    }
  ]
}
```

### Pattern 2 — wrong MIME (415)

The fixture lies about MIME — declared `image/png` but actual bytes
are text. Proves server-side content-sniffing rejects the mismatch.

```json
{
  "fixtures": {
    "malicious-text-as-png": {
      "path": "<test-fixtures-dir>/text.txt",
      "mimeType": "image/png"
    }
  }
}
```

```json
{
  "id": "<task-id>:<upload-endpoint>-wrong-mime",
  "description": "Upload claiming image/png but actual bytes are text rejects with 415",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<upload-path>",
        "bodyKind": "multipart",
        "multipart": [
          { "name": "file", "file": { "fixtureRef": "malicious-text-as-png" } }
        ]
      },
      "expect": {
        "status": 415,
        "jsonpath": {
          "$.code": { "oneOf": ["UNSUPPORTED_MEDIA_TYPE", "MIME_MISMATCH"] }
        }
      }
    }
  ]
}
```

### Pattern 3 — oversize (413)

```json
{
  "fixtures": {
    "oversize-blob": {
      "path": "<test-fixtures-dir>/oversize-<over-limit>.bin",
      "mimeType": "application/octet-stream"
    }
  }
}
```

```json
{
  "id": "<task-id>:<upload-endpoint>-oversize",
  "description": "Upload exceeding <max-bytes> rejects with 413",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<upload-path>",
        "bodyKind": "multipart",
        "multipart": [
          { "name": "file", "file": { "fixtureRef": "oversize-blob" } }
        ]
      },
      "expect": {
        "status": 413,
        "jsonpath": {
          "$.code": { "oneOf": ["PAYLOAD_TOO_LARGE", "FILE_TOO_LARGE"] }
        }
      }
    }
  ]
}
```

### Pattern 4 — malformed multipart (400)

`bodyKind: "binary"` sidesteps the multipart builder so we can send
deliberately-broken bytes with a wrong boundary.

```json
{
  "id": "<task-id>:<upload-endpoint>-malformed-boundary",
  "description": "Truncated multipart boundary rejects with 400",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<upload-path>",
        "bodyKind": "binary",
        "body": "<truncated-multipart-bytes>",
        "headers": {
          "Content-Type": "multipart/form-data; boundary=----wrongboundary"
        }
      },
      "expect": {
        "status": 400,
        "jsonpath": {
          "$.code": { "oneOf": ["BAD_REQUEST", "MALFORMED_MULTIPART"] }
        }
      }
    }
  ]
}
```

### Pattern 5 — multiple-file array

```json
{
  "fixtures": {
    "png-A": { "path": "<test-fixtures-dir>/A.png", "mimeType": "image/png" },
    "png-B": { "path": "<test-fixtures-dir>/B.png", "mimeType": "image/png" },
    "png-C": { "path": "<test-fixtures-dir>/C.png", "mimeType": "image/png" }
  }
}
```

```json
{
  "id": "<task-id>:<upload-endpoint>-multi-file",
  "description": "Three-file batch upload returns 201 with three URLs",
  "actor": "<actor>",
  "steps": [
    {
      "request": {
        "method": "POST",
        "path": "<upload-path>",
        "bodyKind": "multipart",
        "multipart": [
          { "name": "files[]", "file": { "fixtureRef": "png-A" } },
          { "name": "files[]", "file": { "fixtureRef": "png-B" } },
          { "name": "files[]", "file": { "fixtureRef": "png-C" } }
        ]
      },
      "expect": {
        "status": 201,
        "jsonpath": {
          "$.uploads": { "length": 3 },
          "$.uploads[*].url": { "matches": "^https?://" }
        }
      }
    }
  ]
}
```

### Pattern 6 — binary download (Content-Type + Content-Disposition)

```json
{
  "id": "<task-id>:<download-endpoint>-binary",
  "description": "Download returns binary with declared content-type and disposition",
  "actor": "<actor>",
  "setup": [
    { "create": "<upload-resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": { "method": "GET", "path": "<download-path-with-${id}>" },
      "expect": {
        "status": 200,
        "headers": {
          "Content-Type": "image/png",
          "Content-Disposition": { "contains": "attachment" },
          "Content-Length": { "matches": "^\\d+$" }
        },
        "body": {
          "bodyMatchesFixture": "<upload-fixture>"
        }
      }
    }
  ]
}
```

### Pattern 7 — Range request (206 Partial Content)

```json
{
  "id": "<task-id>:<download-endpoint>-range-request",
  "description": "Range header returns 206 with Content-Range and partial body",
  "actor": "<actor>",
  "setup": [
    { "create": "<upload-resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "<download-path-with-${id}>",
        "headers": { "Range": "bytes=0-99" }
      },
      "expect": {
        "status": 206,
        "headers": {
          "Content-Range": { "matches": "^bytes 0-99/\\d+$" },
          "Accept-Ranges": "bytes",
          "Content-Length": "100"
        }
      }
    }
  ]
}
```

### Pattern 8 — Range request (416 unsatisfiable)

```json
{
  "id": "<task-id>:<download-endpoint>-range-unsatisfiable",
  "description": "Range outside file extent returns 416",
  "actor": "<actor>",
  "setup": [
    { "create": "<upload-resource>", "by": "<actor>", "capture": "$id" }
  ],
  "steps": [
    {
      "request": {
        "method": "GET",
        "path": "<download-path-with-${id}>",
        "headers": { "Range": "bytes=10000000-20000000" }
      },
      "expect": { "status": 416 }
    }
  ]
}
```

### Pattern 9 — body-shape primitive on download

```json
{
  "id": "<task-id>:<download-endpoint>-csv-shape",
  "description": "CSV download has expected header row + data rows",
  "actor": "<actor>",
  "steps": [
    {
      "request": { "method": "GET", "path": "<export-path>", "headers": { "Accept": "text/csv" } },
      "expect": {
        "status": 200,
        "headers": {
          "Content-Type": { "matches": "^text/csv" },
          "Content-Disposition": { "contains": "attachment" }
        },
        "body": {
          "contains": "<header-row>",
          "lines": { "length_gte": 2 },
          "matches": "^[^\\n]+\\n[^\\n]+"
        }
      }
    }
  ]
}
```

## Worked example — full §11.12 coverage on an upload + download

> Spec: `POST /<uploads-collection>` accepts a single image file
> (PNG, JPEG, max 5MB). Returns 201 + `url`. `GET <url>` returns the
> binary with `Content-Disposition: attachment; filename=<original>`.
> Range requests supported.

Floor: 7 flows.

| Flow id | Asserts |
|---|---|
| `<task-id>:<uploads-collection>-happy` | PNG upload → 201, URL matches https? |
| `<task-id>:<uploads-collection>-wrong-mime` | text/plain upload → 415 |
| `<task-id>:<uploads-collection>-oversize` | 6MB blob → 413 |
| `<task-id>:<uploads-collection>-malformed-boundary` | truncated multipart → 400 |
| `<task-id>:<uploads-collection>-download-binary` | full GET → 200 + content-type + disposition |
| `<task-id>:<uploads-collection>-download-range` | partial GET → 206 + Content-Range |
| `<task-id>:<uploads-collection>-download-range-unsatisfiable` | bad range → 416 |

Multi-file (`files[]`) is omitted because the spec says single file
only — emitting a multi-file flow would be a coverage stretch
beyond what the spec promises.
