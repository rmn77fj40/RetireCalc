// script.js

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
    const initialSavings = getInputValue('initialSavings');
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
        alert("Your Desired Retirement Age cannot be less than your Current Age. Adjust one or both values.");
        return;
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
    // This warning should be adjusted as the SS start age can be before current age if simulating a past scenario
    // if (robSocialSecurityStartAge < currentAge && robSocialSecurityMonthly > 0) {
    //      alert("Your SS Start Age is before your current age. Social Security income will not be included from the start.");
    // }


    // Initialize dynamic variables *before* the loop
    let currentBalance = initialSavings;
    let currentRobSalary = robCurrentSalary;
    let currentSonjaSalary = sonjaCurrentSalary;
    let currentRobSocialSecurityMonthly = robSocialSecurityMonthly;
    let currentSonjaSocialSecurityMonthly = sonjaSocialSecurityMonthly;
    let currentOtherMonthlyIncome = otherMonthlyIncome;

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

    let yearsSinceRobRetirement = 0; // Counter for PERA AI waiting period

    // Main calculation loop: Iterate from current age up to planToAge
    for (let i = 0; i <= (planToAge - currentAge); i++) {
        const year = startYear + i; // Current year of the projection
        const robAgeThisYear = currentAge + i; // Rob's age for the current year
        const sonjaAgeThisYear = partnerCurrentAge + i; // Sonja's age for the current year

        // Determine which investment growth rate to use for the current year
        const annualInvestmentGrowthRate = (robAgeThisYear < retirementAge) ?
                                            preRetirementGrowthRateDecimal :
                                            postRetirementGrowthRateDecimal;

        // Increment years since retirement counter if Rob is retired
        if (robAgeThisYear >= retirementAge) {
            yearsSinceRobRetirement = robAgeThisYear - retirementAge;
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
            // annualContributionForCalculation = monthlyInvestmentContribution * 12; // Contributions happen while working
        }

        // --- Sonja's Salary ---
        if (sonjaAgeThisYear < partnerRetirementAge) {
            sonjaAnnualIncome = currentSonjaSalary;
            currentSonjaSalary *= (1 + salaryGrowthRateDecimal); // Inflate for next year
            // Assuming contributions stop when Rob retires, not Sonja
            // If contributions are tied to Sonja's working, this logic needs adjustment
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
        if (robAgeThisYear >= retirementAge) { // Or a specific start age for other income if added later
            otherAnnualIncome = currentOtherMonthlyIncome * 12;

            // Apply PERA AI only after waiting period and if rate is positive
            if (peraAnnualIncreaseRateDecimal > 0 && (yearsSinceRobRetirement * 12) >= peraAIWaitMonths) {
                currentOtherMonthlyIncome *= (1 + peraAnnualIncreaseRateDecimal); // Inflate for next year
            }
        }

        // Total Gross Income (before taxes)
        let totalGrossIncome = robAnnualIncome + sonjaAnnualIncome +
                                robSocialSecurityIncome + sonjaSocialSecurityIncome +
                                otherAnnualIncome; // This is the "Total Income" column

        // --- Calculate Annual Expenses based on Phases ---
        let baseAnnualExpenses = baseMonthlyRetirementSpending * 12;
        let additionalAnnualExpenses = 0;

        if (robAgeThisYear >= goGoStartAge && robAgeThisYear <= goGoEndAge) {
            additionalAnnualExpenses += goGoMonthlySpending * 12;
        }
        if (robAgeThisYear >= goSlowStartAge && robAgeThisYear <= goSlowEndAge) {
            additionalAnnualExpenses += goSlowMonthlySpending * 12;
        }

        // Inflate expenses for the current year's calculation
        let totalCurrentYearNominalExpenses = (baseAnnualExpenses + additionalAnnualExpenses) * Math.pow(1 + inflationRateDecimal, i);

        // --- Handle Contributions/Withdrawals and Update Balance ---
        let beginningBalance = currentBalance;

        // Add annual contribution at the start of the year (only if applicable)
        // currentBalance += annualContributionForCalculation; // THIS LINE IS NOW COMMENTED OUT

        // Calculate taxable income and taxes
        // Income for tax purposes usually includes salary, pension, and a portion of SS.
        // For simplicity, we are taxing 'totalGrossIncome' plus any withdrawals needed to meet expenses.
        let annualTaxes = totalGrossIncome * effectiveTaxRateDecimal; // Tax on gross income
        // If withdrawals are needed, they also contribute to taxable income in a real scenario,
        // but for this model's simplicity, we apply a flat tax rate on "income" and then determine withdrawals.
        // A more complex model would iterate on withdrawals until after-tax needs are met.

        let netCashFlowBeforeWithdrawals = totalGrossIncome - annualTaxes - totalCurrentYearNominalExpenses;
        let savingsWithdrawals = 0;

        if (netCashFlowBeforeWithdrawals < 0) { // If cash flow is negative, it's a withdrawal from savings
            savingsWithdrawals = Math.abs(netCashFlowBeforeWithdrawals);
            currentBalance -= savingsWithdrawals;
        }


        // --- Check for Shortfall ---
        let shortfall = 0;
        if (currentBalance < 0) {
            shortfall = Math.abs(currentBalance);
            currentBalance = 0; // Savings depleted
            if (globalShortfallYear === 'N/A') {
                globalShortfallYear = year; // Record first year of shortfall
            }
        }

        // --- Apply Investment Growth (only if balance is positive) ---
        if (currentBalance > 0) {
            currentBalance *= (1 + annualInvestmentGrowthRate);
        }

        // --- Capture balance at Rob's retirement age for summary ---
        if (robAgeThisYear === retirementAge) {
            globalBalanceAtRobRetirement = currentBalance;
        }


        // --- Handle Display Logic for Today's Dollars ---
        let displayTotalIncome = totalGrossIncome;
        let displayAnnualExpenses = totalCurrentYearNominalExpenses;
        let displayBalanceStart = beginningBalance;
        let displayBalanceEnd = currentBalance;
        let displaySavingsWithdrawals = savingsWithdrawals;
        let displayShortfall = shortfall;
        let displayAnnualTaxes = annualTaxes;
        let displayContributions = annualContributionForCalculation; // The actual contribution made this year
        let displaySocialSecurityIncome = robSocialSecurityIncome + sonjaSocialSecurityIncome;
        let displayPensionIncome = otherAnnualIncome;


        if (calculateInTodayDollars) {
            // Divide by the inflation factor from the *start* of the projection (current year is i=0, factor=1)
            const inflationFactor = Math.pow(1 + inflationRateDecimal, i);
            if (inflationFactor > 0) { // Avoid division by zero
                displayTotalIncome /= inflationFactor;
                displayAnnualExpenses /= inflationFactor;
                displayBalanceStart /= inflationFactor;
                displayBalanceEnd /= inflationFactor;
                displaySavingsWithdrawals /= inflationFactor;
                displayShortfall /= inflationFactor;
                displayAnnualTaxes /= inflationFactor;
                displayContributions /= inflationFactor; // New
                displaySocialSecurityIncome /= inflationFactor; // New
                displayPensionIncome /= inflationFactor; // New
            }
        }

        // Store results for display and CSV
        lastCalculatedResults.push({
            year: year,
            robAge: robAgeThisYear,
            sonjaAge: sonjaAgeThisYear,
            balanceStart: displayBalanceStart,
            contributions: displayContributions,
            socialSecurityIncome: displaySocialSecurityIncome,
            pensionIncome: displayPensionIncome,
            totalIncome: displayTotalIncome,         // SWAPPED POSITION
            totalExpenses: displayAnnualExpenses,    // SWAPPED POSITION
            annualTaxes: displayAnnualTaxes,
            savingsWithdrawals: displaySavingsWithdrawals,
            savingsAtYearEnd: displayBalanceEnd,
            shortfall: displayShortfall
        });
    } // End of for loop

    // Update summary results after the loop completes
    document.getElementById('summaryRobAge').textContent = lastCalculatedResults[lastCalculatedResults.length - 1].robAge;
    document.getElementById('summarySonjaAge').textContent = lastCalculatedResults[lastCalculatedResults.length - 1].sonjaAge;
    document.getElementById('balanceAtRobRetirement').textContent = formatCurrency(globalBalanceAtRobRetirement);
    document.getElementById('balanceAtEndOfPlan').textContent = formatCurrency(lastCalculatedResults[lastCalculatedResults.length - 1].savingsAtYearEnd);
    document.getElementById('shortfallYear').textContent = globalShortfallYear;

    // Display the detailed table results
    displayResults();
}

// Function to populate the detailed projection table
function displayResults() {
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    resultsTableBody.innerHTML = ''; // Clear previous results

    lastCalculatedResults.forEach(row => {
        const tr = document.createElement('tr');
        if (row.shortfall > 0) {
            tr.classList.add('shortfall-row');
        }

        tr.innerHTML = `
            <td>${row.year}</td>
            <td>${row.robAge}</td>
            <td>${row.sonjaAge}</td>
            <td>${formatCurrency(row.balanceStart)}</td>
            <td>${formatCurrency(row.contributions)}</td>
            <td>${formatCurrency(row.socialSecurityIncome)}</td>
            <td>${formatCurrency(row.pensionIncome)}</td>
            <td>${formatCurrency(row.totalIncome)}</td>         <td>${formatCurrency(row.totalExpenses)}</td>      <td>${formatCurrency(row.annualTaxes)}</td>
            <td>${formatCurrency(row.savingsWithdrawals)}</td>
            <td>${formatCurrency(row.savingsAtYearEnd)}</td>
            <td>${formatCurrency(row.shortfall)}</td>
        `;
        resultsTableBody.appendChild(tr);
    });
}


// Function to export results to CSV
function exportToCsv() {
    if (lastCalculatedResults.length === 0) {
        alert("No data to export. Please run the calculation first.");
        return;
    }

    const header = [
        "Year", "Your Age", "Partner Age", "Savings Start of Year", "Contributions",
        "Social Security Income", "Pension Income",
        "Total Income",         // SWAPPED POSITION
        "Total Expenses",       // SWAPPED POSITION
        "Total Taxes", "Savings Withdrawals",
        "Savings at Year End", "Shortfall"
    ];
    // Ensure values are not formatted (e.g., no '$' or commas) for CSV
    const csvRows = [
        header.join(',')
    ];

    lastCalculatedResults.forEach(row => {
        const values = [
            row.year, row.robAge, row.sonjaAge, row.balanceStart, row.contributions,
            row.socialSecurityIncome, row.pensionIncome,
            row.totalIncome,         // SWAPPED POSITION
            row.totalExpenses,       // SWAPPED POSITION
            row.annualTaxes, row.savingsWithdrawals,
            row.savingsAtYearEnd, row.shortfall
        ];
        // Convert numbers to fixed 2 decimal places for consistency in CSV
        csvRows.push(values.map(v => typeof v === 'number' ? v.toFixed(2) : v).join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'retirement_projection.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}