import hashlib
from flask import Flask, Response, json, request, send_file, jsonify
from werkzeug.utils import secure_filename
from flask_cors import CORS
import requests
from PIL import Image
import traceback
import os

app = Flask(__name__)
CORS(app)  # Allow all origins


@app.errorhandler(500)
def internal_error(error):
    # Logs full error traceback
    print("INTERNAL SERVER ERROR:", traceback.format_exc())
    return jsonify({"error": "Internal Server Error"}), 500

# 🔹 Compress PDF (Updated with target_size_kb)


@app.route('/compress', methods=['POST'])
def compress_pdf():
    print("Received request for PDF compression")

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    file.filename = "encrypted.enc.pdf"
    constraints = request.form.get("constraints")
    constraints = json.loads(constraints) if constraints else {}
    target_size_kb = constraints.get("maxSize")

    try:
        # Convert to integer and validate
        if target_size_kb:
            target_size_kb = int(target_size_kb)
            if target_size_kb <= 0:
                raise ValueError
    except ValueError:
        return jsonify({"error": "Invalid target_size_kb value"}), 400

    print(f"Target size (KB): {target_size_kb}")

    try:
        password = request.headers.get('X-Password')
        print("Password:", password)

        # Forward with exact binary data
        response = requests.post(
            'https://docker-c05d.onrender.com/file-operations/compress_pdf/',
            files={'file': (file.filename, file.stream,
                            'application/octet-stream')},
            headers={'X-Password': password},
            # Pass target_size_kb as part of the form data
            data={'target_size_kb': target_size_kb}
        )

        print("Response from Docker:", response.status_code)

        return Response(
            response.content,
            content_type='application/pdf',
            headers={
                'X-Original-Content-Type': 'application/pdf'
            }
        )

    except Exception as e:
        print(f"Unexpected error: {traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/imgCompressor', methods=['POST'])
def imgCompressor():
    print("Received request for imgCompressor")

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    print("Received file:", file.filename)
    file.filename = "encrypted.enc"
    file.save(file.filename)  # Save the file locally for debugging
    print("File saved locally")

    try:
        password = request.headers.get('X-Password')
        print("Password:", password)

        file = request.files['file']
        files = {
            'file': (
                file.filename,
                file.stream,
                file.content_type  # Preserve original MIME type
            )
        }
        print(file.filename+"saved and sent")
        file_data = file.read()
        print(f"SHA256: {hashlib.sha256(file_data).hexdigest()}")
        file.seek(0)

        # Forward directly to Django
        response = requests.post(
            'https://docker-c05d.onrender.com/file-operations/imageCompressor/',
            files=files,
            headers={'X-Password': password}
        )

        print("Response from Docker:", response.status_code)

        file.stream.seek(0)  # Reset stream position

        # Verify binary integrity
        if len(response.content) % 16 != 0:
            print(
                f"⚠️ Corrupted response: {len(response.content)} bytes (not 16-byte aligned)")
            return jsonify({"error": "Server returned invalid data format"}), 500

        return Response(
            response.content,
            content_type='application/octet-stream',
            headers={
                'X-Original-Content-Type': response.headers.get('X-Original-Content-Type', '')
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/split', methods=['POST'])
def split_pdf():
    print("Received request for splitting pdf")

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    print("Received file:", file.filename)
    file.filename = "encrypted.enc"

    try:
        # Preserve binary data exactly
        password = request.headers.get('X-Password')
        print("Password:", password)

        # Forward with exact binary data
        response = requests.post(
            'https://docker-c05d.onrender.com/file-operations/split_pdf_file/',
            files={'file': (file.filename, file.stream,
                            'application/octet-stream')},
            headers={'X-Password': password}
        )

        print("Response from Docker:", response.status_code)

        return Response(
            response.content,
            content_type='application/zip',
            headers={
                'X-Original-Content-Type': 'application/zip'
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/merge', methods=['POST'])
def merge_files():
    if 'files' not in request.files:
        return jsonify({"error": "No files uploaded"}), 400

    password = request.headers.get('X-Password', '')
    files = request.files.getlist('files')

    try:
        print(f"Starting merge of {len(files)} files")

        # Prepare files for forwarding
        files_to_send = []
        for idx, file in enumerate(files):
            # Validate file content
            if not file.filename or file.filename.strip() == '':
                return jsonify({"error": f"File {idx+1} has invalid name"}), 400

            # Reset file stream position
            file.stream.seek(0)
            files_to_send.append(
                ('files', (file.filename, file.stream, file.content_type))
            )

        # Debug print
        print("Sending files to Docker:", [f[1][0] for f in files_to_send])

        # Send to Docker with proper encoding
        response = requests.post(
            "https://docker-c05d.onrender.com/file-operations/mergePDF/",
            files=files_to_send,
            headers={
                'X-Password': password,
                'Connection': 'close'
            },
            timeout=30
        )

        print(
            f"Docker response: {response.status_code}, Content-Length: {len(response.content)}")

        # Validate response
        if response.status_code != 200:
            return jsonify({
                "error": f"Docker service error ({response.status_code})",
                "details": response.text[:200]  # Show first 200 chars of error
            }), 502

        # Forward successful response
        return Response(
            response.content,
            content_type='application/octet-stream',
            headers={
                'X-Original-Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="merged_encrypted.pdf"'
            }
        )

    except requests.exceptions.RequestException as e:
        print(f"Request failed: {str(e)}")
        return jsonify({"error": "Connection to Docker service failed"}), 503
    except Exception as e:
        print(f"Unexpected error: {traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
