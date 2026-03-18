//! Privacy-preserving portfolio sanitization for remote AI processing.

use super::tools::{TotalPortfolioValue, TokenValueItem};

/// Sanitizes portfolio data by removing specific addresses and converting exact 
/// amounts into relative metrics/weights.
pub fn sanitize_portfolio(portfolio: &TotalPortfolioValue) -> String {
    let mut lines = Vec::new();
    
    lines.push(format!("Total Portfolio Value: {}", categorize_value(&portfolio.total_usd)));
    lines.push(format!("Number of Wallets: {}", portfolio.wallet_count));
    lines.push("Asset Allocation:".to_string());
    
    // Convert USD strings to f64 for percentage calculation
    let total_f: f64 = portfolio.total_usd.trim_start_matches('$').replace(',', "").parse().unwrap_or(1.0);
    
    for item in &portfolio.breakdown {
        let val_f: f64 = item.value.trim_start_matches('$').replace(',', "").parse().unwrap_or(0.0);
        let pct = (val_f / total_f.max(1.0)) * 100.0;
        
        // Categorize the asset type/size instead of showing exact balance
        let size_category = categorize_allocation(pct);
        
        lines.push(format!("- {}: {:.1}% ({})", item.token, pct, size_category));
    }
    
    lines.join("\n")
}

fn categorize_value(val_str: &str) -> String {
    let v: f64 = val_str.trim_start_matches('$').replace(',', "").parse().unwrap_or(0.0);
    if v < 1000.0 {
        "Micro (<$1k)".into()
    } else if v < 10000.0 {
        "Small ($1k-$10k)".into()
    } else if v < 100000.0 {
        "Medium ($10k-$100k)".into()
    } else if v < 1000000.0 {
        "Large ($100k-$1M)".into()
    } else {
        "Whale (>$1M)".into()
    }
}

fn categorize_allocation(pct: f64) -> &'static str {
    if pct > 50.0 {
        "Dominant"
    } else if pct > 20.0 {
        "Significant"
    } else if pct > 5.0 {
        "Moderate"
    } else {
        "Small"
    }
}
