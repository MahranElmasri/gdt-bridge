#!/bin/bash

# Manual Bridge Test Script
# This simulates what the bridge agent should be doing

API_KEY="123456789abcdef123456789abcdef1234567890"
BASE_URL="http://localhost:3000"
OUTPUT_DIR="/Users/mahran.elmasri/Desktop/gdt-files"

echo "=========================================="
echo "Manual GDT Bridge Test"
echo "=========================================="
echo ""
echo "API URL: $BASE_URL"
echo "Output: $OUTPUT_DIR"
echo "API Key: ${API_KEY:0:20}..."
echo ""

# Step 1: Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "❌ Output directory does not exist: $OUTPUT_DIR"
    echo "Creating directory..."
    mkdir -p "$OUTPUT_DIR"
    echo "✅ Directory created"
fi
echo ""

# Step 2: Fetch pending files
echo "Step 1: Fetching pending GDT files..."
echo "=========================================="
RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/api/gdt/pending")

# Check if request was successful
if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to server"
    exit 1
fi

# Parse response
echo "$RESPONSE" | python3 -m json.tool
echo ""

# Step 3: Extract and save files
echo "Step 2: Extracting and saving files..."
echo "=========================================="

# Save response to temp file
echo "$RESPONSE" > /tmp/gdt_response.json

python3 <<'PYTHON_SCRIPT'
import json
import os

output_dir = '/Users/mahran.elmasri/Desktop/gdt-files'

# Read from temp file
with open('/tmp/gdt_response.json', 'r') as f:
    data = json.load(f)

if not data.get('success'):
    print(f"❌ API error: {data.get('error', 'Unknown error')}")
    exit(1)

files = data.get('data', [])
count = data.get('count', 0)

print(f"Found {count} pending file(s)")
print()

if count == 0:
    print("No files to process")
    exit(0)

# Clear previous IDs
open('/tmp/gdt_pending_ids.txt', 'w').close()

for file_data in files:
    file_id = file_data['id']
    filename = file_data['filename']
    content = file_data['content']

    filepath = os.path.join(output_dir, filename)

    print(f"Processing: {filename}")
    print(f"  ID: {file_id}")
    print(f"  Size: {len(content)} bytes")

    # Write file with Latin-1 encoding (GDT standard)
    with open(filepath, 'w', encoding='latin1') as f:
        f.write(content)

    print(f"  ✅ Written to: {filepath}")
    print()

    # Save file ID for delivery confirmation
    with open('/tmp/gdt_pending_ids.txt', 'a') as f:
        f.write(f"{file_id}\n")

PYTHON_SCRIPT

if [ $? -ne 0 ]; then
    echo "❌ File extraction failed"
    exit 1
fi

# Step 4: Mark files as delivered
echo "Step 3: Marking files as delivered..."
echo "=========================================="

if [ -f "/tmp/gdt_pending_ids.txt" ]; then
    while IFS= read -r file_id; do
        if [ -n "$file_id" ]; then
            echo "Marking as delivered: $file_id"
            DELIVER_RESPONSE=$(curl -s -X POST -H "X-API-Key: $API_KEY" \
                "$BASE_URL/api/gdt/delivered/$file_id")

            echo "$DELIVER_RESPONSE" | python3 -m json.tool
            echo ""
        fi
    done < /tmp/gdt_pending_ids.txt

    # Clean up
    rm /tmp/gdt_pending_ids.txt /tmp/gdt_response.json
else
    echo "No files to mark as delivered"
fi

echo "=========================================="
echo "✅ Test complete!"
echo "=========================================="
echo ""
echo "Check your files at: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR" 2>/dev/null || echo "Directory is empty or does not exist"
