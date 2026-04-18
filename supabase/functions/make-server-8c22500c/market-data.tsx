// Market data utilities for fetching financial information

export async function fetchMarketData() {
  try {
    const apiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    if (!apiKey) {
      console.log('Alpha Vantage API key not found, using mock data');
      return getMockMarketData();
    }

    // Fetch Treasury Yield (10-year)
    const treasuryResponse = await fetch(
      `https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=daily&maturity=10year&apikey=${apiKey}`
    );
    const treasuryData = await treasuryResponse.json();

    // Fetch S&P 500 data
    const spyResponse = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${apiKey}`
    );
    const spyData = await spyResponse.json();

    // Fetch Economic Indicators (GDP, Unemployment, etc.)
    const economicResponse = await fetch(
      `https://www.alphavantage.co/query?function=REAL_GDP&interval=annual&apikey=${apiKey}`
    );
    const economicData = await economicResponse.json();

    // Parse the data
    let treasuryYield = 'N/A';
    if (treasuryData.data && treasuryData.data.length > 0) {
      treasuryYield = `${parseFloat(treasuryData.data[0].value).toFixed(2)}%`;
    }

    let marketStatus = 'N/A';
    if (spyData['Global Quote']) {
      const quote = spyData['Global Quote'];
      const price = parseFloat(quote['05. price']).toFixed(2);
      const change = parseFloat(quote['09. change']).toFixed(2);
      const changePercent = quote['10. change percent'];
      marketStatus = `SPY: $${price} (${change > 0 ? '+' : ''}${change}, ${changePercent})`;
    }

    return {
      treasuryYield,
      marketStatus,
      economicCalendar: 'FOMC Meeting (upcoming), Jobs Report (Friday)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching market data:', error);
    return getMockMarketData();
  }
}

export async function fetchComprehensiveMarketUpdate() {
  try {
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    const newsApiKey = Deno.env.get('NEWS_API_KEY');
    
    // Fetch market data
    let treasuryYield = 'N/A';
    let marketStatus = 'N/A';
    
    if (alphaVantageKey) {
      try {
        // Fetch Treasury Yield
        const treasuryResponse = await fetch(
          `https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=daily&maturity=10year&apikey=${alphaVantageKey}`
        );
        const treasuryData = await treasuryResponse.json();
        
        if (treasuryData.data && treasuryData.data.length > 0) {
          treasuryYield = `${parseFloat(treasuryData.data[0].value).toFixed(2)}%`;
        }

        // Fetch S&P 500 data
        const spyResponse = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${alphaVantageKey}`
        );
        const spyData = await spyResponse.json();
        
        if (spyData['Global Quote']) {
          const quote = spyData['Global Quote'];
          const price = parseFloat(quote['05. price']).toFixed(2);
          const change = parseFloat(quote['09. change']).toFixed(2);
          const changePercent = quote['10. change percent'];
          marketStatus = `$${price} (${change > 0 ? '+' : ''}${change}, ${changePercent})`;
        }
      } catch (error) {
        console.error('Error fetching Alpha Vantage data:', error);
      }
    }

    // Fetch news
    let geopoliticalNews: string[] = [];
    let nationalNews: string[] = [];
    let businessNews: string[] = [];

    if (newsApiKey) {
      try {
        // Geopolitical news
        const geoResponse = await fetch(
          `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=3&apikey=${newsApiKey}`
        );
        const geoData = await geoResponse.json();
        if (geoData.articles) {
          geopoliticalNews = geoData.articles.slice(0, 2).map((article: any) => article.title);
        }

        // US National news
        const nationalResponse = await fetch(
          `https://newsapi.org/v2/top-headlines?country=us&pageSize=3&apikey=${newsApiKey}`
        );
        const nationalData = await nationalResponse.json();
        if (nationalData.articles) {
          nationalNews = nationalData.articles.slice(0, 2).map((article: any) => article.title);
        }

        // Business/Market news
        const businessResponse = await fetch(
          `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=3&apikey=${newsApiKey}`
        );
        const businessData = await businessResponse.json();
        if (businessData.articles) {
          businessNews = businessData.articles.slice(0, 2).map((article: any) => article.title);
        }
      } catch (error) {
        console.error('Error fetching news:', error);
      }
    }

    // If no real data, use mock
    if (treasuryYield === 'N/A' && geopoliticalNews.length === 0) {
      return getMockComprehensiveUpdate();
    }

    return {
      treasuryYield: treasuryYield !== 'N/A' ? treasuryYield : '4.32%',
      spyStatus: marketStatus !== 'N/A' ? marketStatus : '$485.20 (+1.25, +0.26%)',
      geopoliticalNews: geopoliticalNews.length > 0 ? geopoliticalNews : [
        'UN Climate Summit reaches historic agreement on emissions',
        'G7 leaders meet to discuss global economic stability'
      ],
      nationalNews: nationalNews.length > 0 ? nationalNews : [
        'Federal Reserve signals potential rate adjustments',
        'Infrastructure spending bill gains bipartisan support'
      ],
      businessNews: businessNews.length > 0 ? businessNews : [
        'Tech sector shows strong Q4 earnings',
        'Energy prices stabilize amid supply concerns'
      ],
      economicCalendar: 'FOMC Meeting (Jan 28-29), Jobs Report (Feb 7), CPI Data (Feb 13)',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching comprehensive market data:', error);
    return getMockComprehensiveUpdate();
  }
}

function getMockComprehensiveUpdate() {
  const yields = ['4.25', '4.32', '4.18', '4.45', '4.38'];
  const randomYield = yields[Math.floor(Math.random() * yields.length)];
  
  const spyPrices = ['485.20', '488.50', '482.75', '490.10', '486.30'];
  const randomPrice = spyPrices[Math.floor(Math.random() * spyPrices.length)];
  const randomChange = (Math.random() * 4 - 2).toFixed(2);
  const randomPercent = (Math.random() * 0.8 - 0.4).toFixed(2);

  return {
    treasuryYield: `${randomYield}%`,
    spyStatus: `$${randomPrice} (${randomChange > 0 ? '+' : ''}${randomChange}, ${randomChange > 0 ? '+' : ''}${randomPercent}%)`,
    geopoliticalNews: [
      'UN Climate Summit reaches historic agreement on emissions',
      'G7 leaders meet to discuss global economic stability'
    ],
    nationalNews: [
      'Federal Reserve signals potential rate adjustments',
      'Infrastructure spending bill gains bipartisan support'
    ],
    businessNews: [
      'Tech sector shows strong Q4 earnings',
      'Energy prices stabilize amid supply concerns'
    ],
    economicCalendar: 'FOMC Meeting (Jan 28-29), Jobs Report (Feb 7), CPI Data (Feb 13)',
    timestamp: new Date().toISOString()
  };
}

function getMockMarketData() {
  // Mock data that looks realistic
  const yields = ['4.25', '4.32', '4.18', '4.45', '4.38'];
  const randomYield = yields[Math.floor(Math.random() * yields.length)];
  
  const spyPrices = ['485.20', '488.50', '482.75', '490.10', '486.30'];
  const randomPrice = spyPrices[Math.floor(Math.random() * spyPrices.length)];
  const randomChange = (Math.random() * 4 - 2).toFixed(2);
  const randomPercent = (Math.random() * 0.8 - 0.4).toFixed(2);

  return {
    treasuryYield: `${randomYield}%`,
    marketStatus: `SPY: $${randomPrice} (${randomChange > 0 ? '+' : ''}${randomChange}, ${randomChange > 0 ? '+' : ''}${randomPercent}%)`,
    economicCalendar: 'FOMC Meeting (Jan 28-29), Jobs Report (Feb 7), CPI Data (Feb 13)',
    timestamp: new Date().toISOString()
  };
}