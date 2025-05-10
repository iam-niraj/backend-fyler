import requests
import os
import argparse
import sys

# API base URL
BASE_URL = "http://127.0.0.1:5000"


def test_endpoint(endpoint, method="GET", files=None, data=None, headers=None):
    """Test an API endpoint and print the response"""
    url = f"{BASE_URL}/{endpoint}"
    print(f"\n===== Testing {method} {url} =====")

    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(
                url, files=files, data=data, headers=headers)

        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {response.headers}")

        if response.headers.get('Content-Type') == 'application/json':
            print(f"Response JSON: {response.json()}")
        else:
            print(f"Response Length: {len(response.content)} bytes")

        return response
    except Exception as e:
        print(f"Error: {e}")
        return None


def save_response_to_file(response, output_filename):
    """Save the response content to a file"""
    if response and response.status_code == 200:
        with open(output_filename, 'wb') as f:
            f.write(response.content)
        print(f"Response saved to {output_filename}")
        return True
    return False


def test_pdf_compression(pdf_path, headers):
    """Test the PDF compression endpoint with a local PDF file"""
    print(f"\nTesting PDF compression with file: {pdf_path}")

    if not os.path.exists(pdf_path):
        print(f"Error: File {pdf_path} does not exist")
        return

    with open(pdf_path, 'rb') as f:
        filename = os.path.basename(pdf_path)
        files = {'file': (filename, f, 'application/pdf')}
        data = {'constraints': '{"maxSize": 500}'}
        response = test_endpoint(
            "compress", method="POST", files=files, data=data, headers=headers)

        if response and response.status_code == 200:
            output_filename = f"compressed_{filename}"
            save_response_to_file(response, output_filename)


def test_image_compression(image_path, headers):
    """Test the image compression endpoint with a local image file"""
    print(f"\nTesting image compression with file: {image_path}")

    if not os.path.exists(image_path):
        print(f"Error: File {image_path} does not exist")
        return

    with open(image_path, 'rb') as f:
        filename = os.path.basename(image_path)
        files = {'file': (filename, f, 'image/jpeg')}
        response = test_endpoint(
            "imgCompressor", method="POST", files=files, headers=headers)

        if response and response.status_code == 200:
            output_filename = f"compressed_{filename}"
            save_response_to_file(response, output_filename)


def test_pdf_split(pdf_path, headers):
    """Test the PDF splitting endpoint with a local PDF file"""
    print(f"\nTesting PDF splitting with file: {pdf_path}")

    if not os.path.exists(pdf_path):
        print(f"Error: File {pdf_path} does not exist")
        return

    with open(pdf_path, 'rb') as f:
        filename = os.path.basename(pdf_path)
        files = {'file': (filename, f, 'application/pdf')}
        response = test_endpoint(
            "split", method="POST", files=files, headers=headers)

        if response and response.status_code == 200:
            output_filename = f"split_result.zip"
            save_response_to_file(response, output_filename)


def test_pdf_merge(pdf_paths, headers):
    """Test the PDF merging endpoint with local PDF files"""
    print(f"\nTesting PDF merging with files: {pdf_paths}")

    # Check if all files exist
    for path in pdf_paths:
        if not os.path.exists(path):
            print(f"Error: File {path} does not exist")
            return

    # Open all files
    file_objects = []
    files_data = []

    try:
        for path in pdf_paths:
            file_obj = open(path, 'rb')
            file_objects.append(file_obj)
            filename = os.path.basename(path)
            files_data.append(
                ('files', (filename, file_obj, 'application/pdf')))

        response = test_endpoint(
            "merge", method="POST", files=files_data, headers=headers)

        if response and response.status_code == 200:
            output_filename = "merged.pdf"
            save_response_to_file(response, output_filename)
    finally:
        # Close all open files
        for file_obj in file_objects:
            file_obj.close()


def main():
    parser = argparse.ArgumentParser(
        description='Test the file processing API with local files')
    parser.add_argument('--operation', choices=['compress', 'image', 'split', 'merge', 'all'],
                        default='all', help='The operation to test')
    parser.add_argument('--files', nargs='+',
                        help='Path(s) to the file(s) to use for testing')

    args = parser.parse_args()

    # Default password header
    headers = {'X-Password': 'password123'}

    # Check if server is running
    try:
        requests.get(f"{BASE_URL}/")
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to the API server at {BASE_URL}")
        print("Please make sure the Flask server is running.")
        sys.exit(1)

    if not args.files:
        print("Error: Please specify at least one file with --files")
        sys.exit(1)

    # Execute the requested operation(s)
    if args.operation in ['compress', 'all'] and args.files:
        test_pdf_compression(args.files[0], headers)

    if args.operation in ['image', 'all'] and args.files:
        test_image_compression(args.files[0], headers)

    if args.operation in ['split', 'all'] and args.files:
        test_pdf_split(args.files[0], headers)

    if args.operation in ['merge', 'all'] and len(args.files) >= 2:
        test_pdf_merge(args.files, headers)
    elif args.operation == 'merge' and len(args.files) < 2:
        print("Error: Merge operation requires at least 2 files")


if __name__ == "__main__":
    main()
