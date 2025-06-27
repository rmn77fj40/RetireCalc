// Global variable to store the results data for CSV export
let lastCalculatedResults = [];
let globalBalanceAtRobRetirement = 0; // Global to capture this value
let globalShortfallYear = 'N/A'; // Global to capture this value


// Helper function to safely get input values
function getInputValue(id) {
    const element = document.getElementById(id);
    if (element) {
        // Use parseFloat to allow decimals, if any, and return 0 if empty or invalid
        return parseFloat(element.value) || 0;
    } else {
        console.error(`Error: Element with ID "${id}" not found.`);
        return 0;
    }
}

// Helper function: Calculate age from birth date string
function calculateAgeFromBirthDate(birthDateString) {
    if (!birthDateString) return 0; // Return 0 if no birth date is provided

    const today = new Date();
    const birthDate = new Date(birthDateString);

    if (isNaN(birthDate.getTime())) { // Check for invalid date
        console.error(`Invalid birth date string: ${birthDateString}`);
        return 0;
    }

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    const d = today.getDate() - birthDate.getDate();

    // Adjust age if birthday hasn't occurred yet this year, or if it's the same month but the day hasn't passed
    if (m < 0 || (m === 0 && d < 0)) {
        age--;
    }
    return age;
}


// Function to format numbers as currency (used for display, not for CSV export of raw numbers)
function formatCurrency(value) {
    if (isNaN(value) || value === null) {
        return '$' + (0).toLocaleString(); // Display $0 if NaN or null for safety
    }
    // Round to nearest integer for display, as per previous outputs
    return '$' + Math.round(value).toLocaleString();
}

// Function to calculate and display retirement projection
function calculateRetirement() {
    console.log("--- Starting Detailed Retirement Calculation ---");

    // --- Dynamically calculate current ages from birth dates ---
    const robBirthDateString = document.getElementById('robBirthDate').value;
    const sonjaBirthDateString = document.getElementById('sonjaBirthDate').value;

    let currentAgeFromBirthDate = calculateAgeFromBirthDate(robBirthDateString);
    let partnerCurrentAgeFromBirthDate = calculateAgeFromBirthDate(sonjaBirthDateString);

    // --- Check for Override Current Age inputs ---
    const overrideCurrentAgeInput = document.getElementById('overrideCurrentAge');
    const overridePartnerCurrentAgeInput = document.getElementById('overridePartnerCurrentAge');

    // Determine 'currentAge' for calculations: Use override if valid and provided, else use birth date calculation
    // '|| 0' added to ensure a numeric 0 if parsed value is NaN (e.g., empty string)
    const currentAge = (overrideCurrentAgeInput && overrideCurrentAgeInput.value !== '' && !isNaN(parseFloat(overrideCurrentAgeInput.value)))
                                         ? parseFloat(overrideCurrentAgeInput.value)
                                         : currentAgeFromBirthDate;

    const partnerCurrentAge = (overridePartnerCurrentAgeInput && overridePartnerCurrentAgeInput.value !== '' && !isNaN(parseFloat(overridePartnerCurrentAgeInput.value)))
                                             ? parseFloat(overridePartnerCurrentAgeInput.value)
                                             : partnerCurrentAgeFromBirthDate;


    // Basic validation for the *derived/overridden* current ages
    if (currentAge <= 0) { // Age must be positive for projection
        alert("Please enter a valid 'Your Birth Date' or 'Simulate Your Current Age' (must be a positive number).");
        return;
    }
    // Only warn about partner age if a birth date was provided but resulted in an invalid age
    if (partnerCurrentAge <= 0 && sonjaBirthDateString) {
        console.warn("Partner's birth date or simulated age is invalid. Partner projection may be inaccurate.");
    }


    // 1. Get ALL other input values here
    const retirementAge = getInputValue('retirementAge');
    const planToAge = getInputValue('planToAge');
    const robCurrentSalary = getInputValue('robCurrentSalary');
    const salaryGrowthRate = getInputValue('salaryGrowthRate');
    const partnerRetirementAge = getInputValue('partnerRetirementAge');
    const sonjaCurrentSalary = getInputValue('sonjaCurrentSalary');
    let initialSavings = getInputValue('initialSavings'); // Make initialSavings mutable if we are using it as `currentBalance` directly
    const preRetirementGrowthRate = getInputValue('averageMarketReturn'); // Renamed for clarity in HTML/JS
    const postRetirementGrowthRate = getInputValue('postRetirementGrowthRate');


    // Expense inputs (including phased spending)
    const baseMonthlyRetirementSpending = getInputValue('monthlyRetirementSpending');
    const goGoMonthlySpending = getInputValue('goGoMonthlySpending');
    const goGoStartAge = getInputValue('goGoStartAge');
    const goGoEndAge = getInputValue('goGoEndAge');
    const goSlowMonthlySpending = getInputValue('goSlowMonthlySpending');
    const goSlowStartAge = getInputValue('goSlowStartAge');
    const goSlowEndAge = getInputValue('goSlowEndAge'); // No dynamic end age for now

    const robSocialSecurityMonthly = getInputValue('robSocialSecurityMonthly');
    const robSocialSecurityStartAge = getInputValue('robSocialSecurityStartAge');
    const sonjaSocialSecurityMonthly = getInputValue('sonjaSocialSecurityMonthly');
    const sonjaSocialSecurityStartAge = getInputValue('sonjaSocialSecurityStartAge');
    const otherMonthlyIncome = getInputValue('otherMonthlyIncome');

    // PERA-specific inputs
    const peraAnnualIncreaseRate = getInputValue('peraAnnualIncreaseRate');
    const peraAIWaitMonths = getInputValue('peraAIWaitMonths');

    const annualInflationRate = getInputValue('annualInflationRate');
    const calculateInTodayDollars = document.getElementById('calculateInTodayDollars').checked;
    const averageEffectiveTaxRate = getInputValue('averageEffectiveTaxRate');
    const monthlyInvestmentContribution = getInputValue('monthlyInvestmentContribution');


    // Further validation (using the *derived/overridden* currentAge)
    if (retirementAge < currentAge) { // If Rob's retirement age is earlier than his current age, adjust or alert
        // This is a soft warning now, as simulation can start younger than retirement age.
        // It becomes an issue if salary/contributions are not handled properly.
        // For now, let it run, but this is a common user error point.
    }
    if (planToAge <= retirementAge) {
        alert("Life Expectancy for Projection (max age) must be greater than Your Desired Retirement Age.");
        return;
    }
    if (initialSavings < 0 || baseMonthlyRetirementSpending < 0) {
        alert("Savings and spending cannot be negative.");
        return;
    }
    if (averageEffectiveTaxRate < 0 || averageEffectiveTaxRate > 100) {
        alert("Income Tax Rate on Withdrawals must be between 0 and 100.");
        return;
    }
    // Validation for expense phases
    if (goGoStartAge > goGoEndAge || goSlowStartAge > goSlowEndAge) {
        alert("Expense phase start age cannot be greater than end age.");
        return;
    }
    if (goGoStartAge && goGoEndAge && goSlowStartAge && goSlowEndAge) { // Only warn if all are defined
        if ( (goGoStartAge < goSlowEndAge && goGoEndAge > goSlowStartAge) ||
             (goSlowStartAge < goGoEndAge && goSlowEndAge > goGoStartAge) ) {
            console.warn("Go-Go and Go-Slow expense phases overlap. Double check your age ranges.");
        }
    }
    if (peraAIWaitMonths < 0) {
        alert("Colorado PERA AI Waiting Period cannot be negative.");
        return;
    }


    // Initialize dynamic variables *before* the loop
    let currentBalance = initialSavings; // This will be the running balance
    let currentRobSalary = robCurrentSalary;
    let currentSonjaSalary = sonjaCurrentSalary;
    let currentRobSocialSecurityMonthly = robSocialSecurityMonthly;
    let currentSonjaSocialSecurityMonthly = sonjaSocialSecurityMonthly;
    let currentOtherMonthlyIncome = otherMonthlyIncome; // Used for PERA annual increase

    // Convert percentage rates to decimals for calculations
    const inflationRateDecimal = annualInflationRate / 100;
    const preRetirementGrowthRateDecimal = preRetirementGrowthRate / 100;
    const postRetirementGrowthRateDecimal = postRetirementGrowthRate / 100;
    const salaryGrowthRateDecimal = salaryGrowthRate / 100;
    const effectiveTaxRateDecimal = averageEffectiveTaxRate / 100;
    const peraAnnualIncreaseRateDecimal = peraAnnualIncreaseRate / 100;


    const startYear = new Date().getFullYear(); // Actual current year
    lastCalculatedResults = [];
    globalShortfallYear = 'N/A'; // Reset global shortfall year
    globalBalanceAtRobRetirement = 0; // Reset global balance at Rob's retirement

    let yearsSinceRobRetirement = 0; // Counter for PERA AI waiting period (used annually)

    // Main calculation loop: Iterate from current age up to planToAge
    for (let i = 0; i <= (planToAge - currentAge); i++) {
        const year = startYear + i; // Current year of the projection
        const robAgeThisYear = currentAge + i; // Rob's age for the current year
        const sonjaAgeThisYear = partnerCurrentAge + i; // Sonja's age for the current year

        // Determine which investment growth rate to use for the current year
        const annualInvestmentGrowthRate = (robAgeThisYear < retirementAge) ?
                                            preRetirementGrowthRateDecimal :
                                            postRetirementGrowthRateDecimal;

        // Increment years since retirement counter if Rob is retired (or starting this year)
        if (robAgeThisYear >= retirementAge) {
            yearsSinceRobRetirement = (robAgeThisYear - retirementAge);
        }

        let robAnnualIncome = 0;
        let sonjaAnnualIncome = 0;
        let robSocialSecurityIncome = 0;
        let sonjaSocialSecurityIncome = 0;
        let otherAnnualIncome = 0; // This will be our Pension Income
        let annualContributionForCalculation = 0; // For internal calculation of contributions

        // --- Rob's Salary ---
        if (robAgeThisYear < retirementAge) {
            robAnnualIncome = currentRobSalary;
            currentRobSalary *= (1 + salaryGrowthRateDecimal); // Inflate for next year
            annualContributionForCalculation = monthlyInvestmentContribution * 12; // Contributions happen while working
        }

        // --- Sonja's Salary ---
        if (sonjaAgeThisYear < partnerRetirementAge) {
            sonjaAnnualIncome = currentSonjaSalary;
            currentSonjaSalary *= (1 + salaryGrowthRateDecimal); // Inflate for next year
        }

        // --- Rob's Social Security ---
        if (robAgeThisYear >= robSocialSecurityStartAge) {
            robSocialSecurityIncome = currentRobSocialSecurityMonthly * 12;
            currentRobSocialSecurityMonthly *= (1 + inflationRateDecimal); // Inflate for next year
        }

        // --- Sonja's Social Security ---
        if (sonjaAgeThisYear >= sonjaSocialSecurityStartAge) {
            sonjaSocialSecurityIncome = currentSonjaSocialSecurityMonthly * 12;
            currentSonjaSocialSecurityMonthly *= (1 + inflationRateDecimal); // Inflate for next year
        }

        // --- Other Income (Pension/Annuity) ---
        // Assume other income starts at Rob's retirement if not specified otherwise
        if (robAgeThisYear >= retirementAge) {
            otherAnnualIncome = currentOtherMonthlyIncome * 12;

            // Apply PERA AI only after waiting period and if rate is positive
            // Note: peraAIWaitMonths is in months, so need to convert yearsSinceRobRetirement to months
            if (peraAnnualIncreaseRateDecimal > 0 && (yearsSinceRobRetirement * 12) >= peraAIWaitMonths) {
                currentOtherMonthlyIncome *= (1 + peraAnnualIncreaseRateDecimal); // Inflate for next year
            }
        }

        // Total Gross Income (before taxes, but includes all income streams)
        let totalGrossIncome = robAnnualIncome + sonjaAnnualIncome +
                                   robSocialSecurityIncome + sonjaSocialSecurityIncome +
                                   otherAnnualIncome;

        // --- Calculate Annual Expenses based on Phases ---
        let baseAnnualExpenses = baseMonthlyRetirementSpending * 12;
        let additionalAnnualExpenses = 0;

        if (robAgeThisYear >= goGoStartAge && robAgeThisYear <= goGoEndAge) {
            additionalAnnualExpenses += goGoMonthlySpending * 12;
        }
        if (robAgeThisYear >= goSlowStartAge && robAgeThisYear <= goSlowEndAge) {
            additionalAnnualExpenses += goSlowMonthlySpending * 12;
        }

        // Inflate expenses for the current year's calculation (nominal value)
        let totalCurrentYearNominalExpenses = (baseAnnualExpenses + additionalAnnualExpenses) * Math.pow(1 + inflationRateDecimal, i);

        // --- Calculate Taxes ---
        // For simplicity, taxing all income + withdrawals. A more robust model would separate this.
        let annualTaxes = totalGrossIncome * effectiveTaxRateDecimal;

        // --- Determine Cash Flow and Savings Interaction ---
        let beginningBalance = currentBalance; // Savings at the start of THIS year

        // Add contributions to savings at the start of the year
        let balanceBeforeGrowth = beginningBalance + annualContributionForCalculation;

        // Calculate Investment Growth for the year on the balance *before* withdrawals
        let calculatedInvestmentGrowth = 0;
        if (balanceBeforeGrowth > 0) {
            calculatedInvestmentGrowth = balanceBeforeGrowth * annualInvestmentGrowthRate;
        }

        // Add investment growth to the balance
        currentBalance = balanceBeforeGrowth + calculatedInvestmentGrowth;

        // Determine net cash flow from income and expenses (before touching savings for deficit)
        let netCashFromIncome = totalGrossIncome - annualTaxes - totalCurrentYearNominalExpenses;

        let savingsWithdrawals = 0;
        let shortfall = 0;

        if (netCashFromIncome < 0) { // If there's a deficit, withdraw from savings
            savingsWithdrawals = Math.abs(netCashFromIncome);
            currentBalance -= savingsWithdrawals; // Reduce savings by the amount needed
        }

        // --- Check for Shortfall (if savings went negative after all operations) ---
        if (currentBalance < 0) {
            shortfall = Math.abs(currentBalance);
            currentBalance = 0; // Savings depleted
            if (globalShortfallYear === 'N/A') {
                globalShortfallYear = year; // Record first year of shortfall
            }
        }

        // --- Capture balance at Rob's retirement age for summary ---
        if (robAgeThisYear === retirementAge) {
            let tempDisplayBalanceEnd = currentBalance; // This 'currentBalance' is the nominal end-of-year balance
            if (calculateInTodayDollars) {
                const inflationFactor = Math.pow(1 + inflationRateDecimal, i);
                if (inflationFactor > 0) {
                    tempDisplayBalanceEnd /= inflationFactor; // Apply inflation adjustment if "Today's Dollars" is checked
                }
            }
            globalBalanceAtRobRetirement = tempDisplayBalanceEnd;
        }


        // --- Handle Display Logic for Today's Dollars ---
        let displayTotalIncome = totalGrossIncome;
        let displayAnnualExpenses = totalCurrentYearNominalExpenses;
        let displayBalanceStart = beginningBalance;
        let displayBalanceEnd = currentBalance; // This is the final nominal balance for the year
        let displaySavingsWithdrawals = savingsWithdrawals;
        let displayShortfall = shortfall;
        let displayAnnualTaxes = annualTaxes;
        let displayContributions = annualContributionForCalculation;
        let displaySocialSecurityIncome = robSocialSecurityIncome + sonjaSocialSecurityIncome;
        let displayPensionIncome = otherAnnualIncome;

        if (calculateInTodayDollars) {
            const inflationFactor = Math.pow(1 + inflationRateDecimal, i);
            if (inflationFactor > 0) { // Avoid division by zero
                displayTotalIncome /= inflationFactor;
                displayAnnualExpenses /= inflationFactor;
                displayBalanceStart /= inflationFactor;
                displayBalanceEnd /= inflationFactor;
                displaySavingsWithdrawals /= inflationFactor;
                displayShortfall /= inflationFactor;
                displayAnnualTaxes /= inflationFactor;
                displayContributions /= inflationFactor;
                displaySocialSecurityIncome /= inflationFactor;
                displayPensionIncome /= inflationFactor;
            }
        }

        lastCalculatedResults.push({
            year: year,
            robAge: robAgeThisYear,
            sonjaAge: sonjaAgeThisYear,
            savingsStart: displayBalanceStart,
            contributions: displayContributions,
            investmentGrowth: calculatedInvestmentGrowth, // This should remain nominal and isn't displayed in Today's Dollars in the current setup.
                                                        // If it needs to be in Today's Dollars, add inflationFactor division here too.
            socialSecurityIncome: displaySocialSecurityIncome,
            pensionIncome: displayPensionIncome,
            totalIncome: displayTotalIncome,
            totalExpenses: displayAnnualExpenses,
            totalTax: displayAnnualTaxes,
            withdrawals: displaySavingsWithdrawals,
            savingsEnd: displayBalanceEnd,
            shortfall: displayShortfall
        });
    }

    // Display summary results
    document.getElementById('summaryRobAge').textContent = planToAge;
    document.getElementById('summarySonjaAge').textContent = partnerCurrentAge + (planToAge - currentAge);
    document.getElementById('balanceAtRobRetirement').textContent = formatCurrency(globalBalanceAtRobRetirement);
    document.getElementById('balanceAtEndOfPlan').textContent = formatCurrency(lastCalculatedResults[lastCalculatedResults.length - 1].savingsEnd);
    document.getElementById('shortfallYear').textContent = globalShortfallYear;

    // Populate the detailed projection table
    const tableBody = document.querySelector('#resultsTable tbody');
    tableBody.innerHTML = ''; // Clear previous results

    lastCalculatedResults.forEach(row => {
        const tr = document.createElement('tr');
        if (row.shortfall > 0) {
            tr.classList.add('shortfall-row');
        }
        tr.innerHTML = `
            <td>${row.year}</td>
            <td>${row.robAge}</td>
            <td>${row.sonjaAge}</td>
            <td>${formatCurrency(row.savingsStart)}</td>
            <td>${formatCurrency(row.contributions)}</td>
            <td>${formatCurrency(row.investmentGrowth)}</td>
            <td>${formatCurrency(row.socialSecurityIncome)}</td>
            <td>${formatCurrency(row.pensionIncome)}</td>
            <td>${formatCurrency(row.totalIncome)}</td>
            <td>${formatCurrency(row.totalExpenses)}</td>
            <td>${formatCurrency(row.totalTax)}</td>
            <td>${formatCurrency(row.withdrawals)}</td>
            <td>${formatCurrency(row.savingsEnd)}</td>
            <td>${formatCurrency(row.shortfall)}</td>
        `;
        tableBody.appendChild(tr);
    });

    console.log("--- Detailed Retirement Calculation Complete ---");
}

function exportToCsv() {
    if (lastCalculatedResults.length === 0) {
        alert("Please calculate retirement projection first.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";

    // Headers
    const headers = [
        "Year", "Your Age", "Partner Age", "Savings Start ($)", "Contributions ($)",
        "Investment Growth ($)", "Social Security Income ($)", "Pension Income ($)",
        "Total Income ($)", "Total Expenses ($)", "Total Tax ($)",
        "Withdrawals ($)", "Savings End ($)", "Shortfall ($)"
    ];
    csvContent += headers.join(",") + "\r\n";

    // Data rows
    lastCalculatedResults.forEach(row => {
        const rowData = [
            row.year,
            row.robAge,
            row.sonjaAge,
            row.savingsStart,
            row.contributions,
            row.investmentGrowth,
            row.socialSecurityIncome,
            row.pensionIncome,
            row.totalIncome,
            row.totalExpenses,
            row.totalTax,
            row.withdrawals,
            row.savingsEnd,
            row.shortfall
        ];
        csvContent += rowData.map(item => {
            // Check if item is a number and not NaN, then convert to fixed 0 decimal places (whole number)
            // Otherwise, convert to string (for non-numbers like "N/A" if it were to appear here)
            return typeof item === 'number' && !isNaN(item) ? item.toFixed(0) : String(item);
        }).join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "retirement_projection.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to toggle the help section visibility
function toggleHelpSection() {
    const helpSection = document.getElementById('helpSection');
    const displayStyle = helpSection.style.display;

    if (displayStyle === 'none' || displayStyle === '') {
        helpSection.style.display = 'block'; // Show the section
        // Optionally, you might want to scroll to the top of the help section
        helpSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        helpSection.style.display = 'none'; // Hide the section
    }
}

// Now, calculateRetirement() will ONLY run when the button is clicked.