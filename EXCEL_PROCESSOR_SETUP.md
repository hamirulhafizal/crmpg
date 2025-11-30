# Excel Processor Setup Guide

This feature allows users to upload Excel/CSV files and process them using OpenAI to extract structured data.

## Features

1. **File Upload**: Upload Excel (.xlsx, .xls) or CSV files
2. **OpenAI Processing**: Automatically extracts:
   - Gender (Male/Female)
   - Ethnicity (Malay/Chinese/Indian/Other)
   - Age (calculated from D.O.B.)
   - Prefix (En, Pn, Cik, Tn based on age)
   - FirstName (extracted from full name)
   - SenderName (Prefix + FirstName)
3. **Excel Download**: Download processed data as Excel file

## Environment Variables

Add the following to your `.env.local` file:

```bash
# OpenAI API Key (either OPENAI_SECRET_KEY or OPENAI_API_KEY will work)
OPENAI_SECRET_KEY=sk-your-openai-api-key-here
# OR
OPENAI_API_KEY=sk-your-openai-api-key-here
```

## How to Use

1. **Login** to your account
2. **Navigate** to Dashboard → Excel Processor
3. **Upload** an Excel or CSV file containing:
   - `Name` column (required)
   - `D.O.B.` or `DOB` or `Date of Birth` column (optional but recommended)
4. **Click** "Process with OpenAI"
5. **Wait** for processing to complete (shows progress)
6. **Download** the processed Excel file

## Expected Input Format

Your Excel/CSV file should have at least these columns:

| Name                                   | D.O.B.     |
| -------------------------------------- | ---------- |
| Hamirul Hafizal Bin Mohamad Kamaruddin | 1997-01-05 |
| Lim Wei Ming                           | 2000-07-12 |
| Siti Nur Aisyah Binti Ahmad            | 1995-03-22 |

Column names are case-insensitive and can be:
- `Name`, `name`, `Full Name`, `Full name`
- `D.O.B.`, `D.O.B`, `DOB`, `dob`, `Date of Birth`, `Date of birth`

## Output Format

The processed Excel file will include:

| Name | D.O.B. | Gender | Ethnicity | Age | Prefix | FirstName | SenderName | row_number | ... (original columns) |
| ---- | ------ | ------ | --------- | --- | ------ | --------- | ---------- | ---------- | ---------------------- |
| ...  | ...    | Male   | Malay     | 28  | En     | Hamirul   | En Hamirul | 1          | ...                    |

## API Routes

### `/api/excel/upload`
- **Method**: POST
- **Body**: FormData with `file` field
- **Response**: JSON with parsed data

### `/api/openai/process-row`
- **Method**: POST
- **Body**: JSON with `rowData` and `rowNumber`
- **Response**: JSON with processed result

### `/api/excel/generate`
- **Method**: POST
- **Body**: JSON with `data` array and `originalHeaders`
- **Response**: Excel file blob

## Limitations

- Maximum file size: 10MB
- Supported formats: .xlsx, .xls, .csv
- Processing happens row-by-row (may take time for large files)
- Requires valid OpenAI API key

## Error Handling

- Invalid file types are rejected
- Files without required columns show error messages
- OpenAI API errors are caught and logged
- Processing continues even if some rows fail

## Notes

- The OpenAI model used is `gpt-4o-mini` (cost-effective)
- You can change the model in `app/api/openai/process-row/route.ts`
- Processing includes a 100ms delay between rows to avoid rate limiting
- All processed rows are saved, even if some fail (errors are logged in `_error` field)

