import requests
from bs4 import BeautifulSoup
import json

# List of financial websites to scrape (You can expand this)
URLS = [
    "https://www.investopedia.com",
    "https://www.nerdwallet.com/article/investing",
    "https://www.cnbc.com/personal-finance/"
    "https://finance.yahoo.com/personal-finance/credit-cards/"
    "https://finance.yahoo.com/personal-finance/mortgages/"
    "https://finance.yahoo.com/personal-finance/banking/"
    "https://finance.yahoo.com/personal-finance/student-loans/"
    "https://finance.yahoo.com/personal-finance/personal-loans/"
    "https://finance.yahoo.com/personal-finance/taxes/"
    "https://www.bankrate.com/investing/best-short-term-investments/"
    "https://www.bankrate.com/investing/how-to-buy-stocks/"
    "https://www.bankrate.com/investing/traditional-ira-vs-roth-ira/"
    "https://www.irs.gov/"
    "https://www.usa.gov/help-with-taxes"
    "https://www.wsj.com/"
    "https://www.nytimes.com/topic/subject/finances"
    "https://www.investing.com/"
    "https://www.forbes.com/personal-finance/"
    "https://www.marketwatch.com/"
    "https://www.bloomberg.com/"
]

HEADERS = {"User-Agent": "Mozilla/5.0"}

# Function to scrape articles from a website
def scrape_website(url):
    response = requests.get(url, headers=HEADERS)
    soup = BeautifulSoup(response.text, "html.parser")

    # Example: Extract article titles & links
    articles = []
    for link in soup.find_all("a", href=True):
        if "article" in link["href"]:  # Adjust this filter as needed
            articles.append({
                "title": link.text.strip(),
                "url": url + link["href"] if "http" not in link["href"] else link["href"]
            })

    return articles

# Collect scraped data from all URLs
scraped_data = []
for url in URLS:
    print(f"Scraping {url}...")
    scraped_data.extend(scrape_website(url))

# Save data to a JSON file
with open("scraped_finance_data.json", "w", encoding="utf-8") as f:
    json.dump(scraped_data, f, indent=4)

print("Scraping complete! Data saved to scraped_finance_data.json")
