#!/bin/bash
# Export presentation to PDF

set -e

echo "Exporting to PDF..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Export to PDF
echo "Running Slidev export..."
npm run export

echo "PDF exported successfully!"
echo "Output file: slides.pdf"
