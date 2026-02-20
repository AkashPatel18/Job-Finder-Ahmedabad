# Company Discovery Guide

## Current Status
- **Companies in database**: 273
- **Target**: 3,700+ IT companies in Ahmedabad/Gandhinagar

## Available Commands

```bash
# View current statistics
npm run aggregate:stats

# Import from CSV/JSON files
npm run aggregate

# Quick paste import (interactive)
npm run quick-import

# Export all to CSV for review
npm run aggregate:export all-companies.csv

# Import from specific file
npm run import:companies your-file.csv
```

## Data Sources for Ahmedabad IT Companies

### 1. GESIA Directory (Gujarat Electronics & Software Industries Association)
- **URL**: https://gesia.org/members-directory
- **Estimated**: 500+ member companies
- **Format**: Web directory, may need manual copy or export

### 2. Glassdoor
- **URL**: https://www.glassdoor.co.in/Explore/top-information-technology-companies-ahmadabad_IS.4,26_ISEC10013_IL.37,46_IM1090.htm
- **Shows**: 1,163 IT companies
- **Note**: Has anti-scraping protection, use `npm run scrape:glassdoor`

### 3. LinkedIn (via Google)
- **Search**: `site:linkedin.com/company "ahmedabad" "information technology"`
- **Method**: Manual extraction or Google search results

### 4. Clutch.co
- **URL**: https://clutch.co/directory/it-services/ahmedabad
- **Shows**: Top rated IT companies
- **Note**: Rate limited, export manually

### 5. GoodFirms
- **URL**: https://www.goodfirms.co/directory/city/top-software-development-companies/ahmedabad
- **Shows**: Software development companies
- **Note**: May require pagination

### 6. MCA (Ministry of Corporate Affairs)
- **URL**: https://www.mca.gov.in/
- **Method**: Search for NIC Code 62 (Computer Programming) companies registered in Ahmedabad
- **Format**: Official government data

### 7. StartupIndia
- **URL**: https://www.startupindia.gov.in/content/sih/en/search.html?states=gujarat
- **Shows**: Registered startups in Gujarat
- **Note**: Filter by Ahmedabad

### 8. AngelList/Wellfound
- **URL**: https://wellfound.com/location/ahmedabad
- **Shows**: Startups and tech companies

### 9. IndiaMART
- **URL**: https://dir.indiamart.com/ahmedabad/software-companies.html
- **Shows**: Software companies directory

### 10. Naukri.com Company Directory
- **Method**: Extract company names from job postings for Ahmedabad IT roles

## Import Formats

### Simple Text (one per line)
```
Company Name 1
Company Name 2
Company Name 3
```

### CSV Format
```csv
name,careers_url,specialty
ABC Tech,https://abc.com/careers,AI/ML
XYZ Solutions,https://xyz.com/jobs,Web Development
```

### JSON Format
```json
[
  {"name": "ABC Tech", "careers_url": "https://abc.com/careers", "specialty": "AI/ML"},
  {"name": "XYZ Solutions", "careers": "https://xyz.com/jobs"}
]
```

### Tab-separated (from Excel/Sheets)
Copy directly from spreadsheet - columns: name, careers_url, specialty

## Workflow for Adding 3,000+ Companies

1. **Export from GESIA**: Get member directory PDF/Excel
2. **Glassdoor Export**: Try scraper or manually copy pages
3. **Clutch Export**: Copy top rated companies list
4. **LinkedIn Search**: Search for IT companies in Ahmedabad
5. **MCA Data**: Request NIC Code 62 company list
6. **Use Quick Import**: `npm run quick-import` to paste data

## Deduplication

The system automatically deduplicates by:
- Normalizing company names (removing Ltd, Pvt, Technologies, etc.)
- Comparing lowercase alphanumeric characters
- Merging data when same company appears from multiple sources

## After Import

1. Run `npm run aggregate:stats` to verify counts
2. Run `npm run aggregate:export` to review all companies
3. Run `npm run monitor:careers` to start monitoring
