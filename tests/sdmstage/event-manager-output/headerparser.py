import os
import glob
import pandas as pd
from datetime import datetime

# ==========================================================
# Configuration
# ==========================================================

OUTPUT_FILE = "combined_columns.csv"

# ==========================================================
# Start
# ==========================================================

print("=" * 80)
print("CSV HEADER MERGER")
print("=" * 80)
print(f"Started : {datetime.now().strftime('%d-%m-%Y %H:%M:%S')}")

current_folder = os.path.dirname(os.path.abspath(__file__))

print(f"\nScanning Folder:")
print(current_folder)

# ==========================================================
# Find CSV Files
# ==========================================================

files = glob.glob(os.path.join(current_folder, "*.csv"))

# Ignore output file
files = [
    f for f in files
    if os.path.basename(f) != OUTPUT_FILE
]

if not files:
    print("\nNo CSV files found.")
    exit()

print(f"\nFound {len(files)} CSV file(s)\n")

for i, f in enumerate(files, start=1):
    print(f"{i:02d}. {os.path.basename(f)}")

print("\n" + "=" * 80)

# ==========================================================
# Read Headers
# ==========================================================

result = {}

success = 0
failed = 0

for index, filepath in enumerate(files, start=1):

    filename = os.path.basename(filepath)

    # Remove .csv from filename
    column_name = os.path.splitext(filename)[0]

    print(f"\n[{index}/{len(files)}] Processing : {filename}")

    try:

        # Read only the header row
        df = pd.read_csv(filepath, nrows=0)

        # Remove accidental spaces from headers
        headers = [
            str(column).strip()
            for column in df.columns
        ]

        result[column_name] = headers

        print(f"   ✓ Headers Found : {len(headers)}")

        for header in headers:
            print(f"      - {header}")

        success += 1

    except Exception as e:

        print(f"   ✗ ERROR : {e}")
        failed += 1

# ==========================================================
# Check Result
# ==========================================================

if not result:
    print("\nNo CSV headers could be read.")
    print("No output file was created.")
    exit()

# ==========================================================
# Create Output
# ==========================================================

print("\n" + "=" * 80)
print("Creating Output CSV...")
print("=" * 80)

# Find the CSV with the most headers
max_rows = max(len(headers) for headers in result.values())

output = {}

for filename, headers in result.items():

    # Pad shorter columns with blank values
    output[filename] = headers + [""] * (
        max_rows - len(headers)
    )

output_df = pd.DataFrame(output)

output_path = os.path.join(
    current_folder,
    OUTPUT_FILE
)

output_df.to_csv(
    output_path,
    index=False
)

# ==========================================================
# Finish
# ==========================================================

print("\nSummary")
print("-" * 40)
print(f"Files Found            : {len(files)}")
print(f"Successfully Processed : {success}")
print(f"Failed                 : {failed}")
print(f"Total Output Columns   : {len(result)}")
print(f"Maximum Headers        : {max_rows}")

print("\nOutput File:")
print(output_path)

print("\nCompleted Successfully!")

print("=" * 80)