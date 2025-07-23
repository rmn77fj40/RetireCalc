// Helper to parse dates consistently
function parseDate(dateString) {
    const parts = dateString.split('-');
    // Date constructor expects month as 0-indexed
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Global constants for 2024 tax year (adjust as needed for future years)
const FEDERAL_TAX_BRACKETS_SINGLE = [
    { income: 11925, rate: 0.10 }, // Was 11600
    { income: 48475, rate: 0.12 }, // Was 47150
    { income: 103350, rate: 0.22 }, // Was 100525
    { income: 197300, rate: 0.24 }, // Was 191950
    { income: 250525, rate: 0.32 }, // Was 243725
    { income: 626350, rate: 0.35 }, // Was 609350
    { income: Infinity, rate: 0.37 }
];

const FEDERAL_TAX_BRACKETS_MARRIED_JOINTLY = [
    { income: 23850, rate: 0.10 }, // Was 23200
    { income: 96950, rate: 0.12 }, // Was 94300
    { income: 206700, rate: 0.22 }, // Was 201050
    { income: 394600, rate: 0.24 }, // Was 383900
    { income: 501050, rate: 0.32 }, // Was 487450
    { income: 751600, rate: 0.35 }, // Was 731200
    { income: Infinity, rate: 0.37 }
];

const STANDARD_DEDUCTION_SINGLE = 15750;
const STANDARD_DEDUCTION_MARRIED_JOINTLY = 31500;

// MODIFIED: Single flat Colorado State Tax Rate
const COLORADO_STATE_TAX_RATE = 0.044; // Flat 4.40% for all years

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('calculateBtn').addEventListener('click', calculateRetirement);
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
});

function calculateAge(birthDate, asOfDate) {
    let age = asOfDate.getFullYear() - birthDate.getFullYear();
    const m = asOfDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && asOfDate.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function calculateFederalIncomeTax(taxableIncome, filingStatus) {
    if (taxableIncome <= 0) return 0;

    const brackets = filingStatus === 'single' ? FEDERAL_TAX_BRACKETS_SINGLE : FEDERAL_TAX_BRACKETS_MARRIED_JOINTLY;
    const standardDeduction = filingStatus === 'single' ? STANDARD_DEDUCTION_SINGLE : STANDARD_DEDUCTION_MARRIED_JOINTLY;

    let totalTax = 0;
    let incomeAfterDeduction = Math.max(0, taxableIncome - standardDeduction);

    let previousBracketIncome = 0;
    for (let i = 0; i < brackets.length; i++) {
        const bracket = brackets[i];
        const incomeInThisBracket = Math.min(incomeAfterDeduction, bracket.income) - previousBracketIncome;

        if (incomeInThisBracket > 0) {
            totalTax += incomeInThisBracket * bracket.rate;
        } else {
            break;
        }
        previousBracketIncome = bracket.income;
    }
    return totalTax;
}

function calculateTaxableSocialSecurity(totalSSIncome, otherIncome, filingStatus) {
    let combinedIncome = otherIncome + (totalSSIncome / 2);
    let taxableSS = 0;

    if (filingStatus === 'single') {
        if (combinedIncome > 34000) {
            taxableSS = Math.min(totalSSIncome * 0.85, (combinedIncome - 34000) * 0.85 + Math.min(totalSSIncome * 0.5, 9000));
        } else if (combinedIncome > 25000) {
            taxableSS = Math.min(totalSSIncome * 0.50, (combinedIncome - 25000) * 0.50);
        }
    } else { // Married Filing Jointly
        if (combinedIncome > 44000) {
            taxableSS = Math.min(totalSSIncome * 0.85, (combinedIncome - 44000) * 0.85 + Math.min(totalSSIncome * 0.5, 12000));
        } else if (combinedIncome > 32000) {
            taxableSS = Math.min(totalSSIncome * 0.50, (combinedIncome - 32000) * 0.50);
        }
    }
    return taxableSS;
}

// MODIFIED: Added federallyTaxableSS parameter and logic for 65+ full deduction
function calculateColoradoStateTax(totalIncomeForStateTax, robAge, sonjaAge, currentYear, federallyTaxableSS) {
    if (totalIncomeForStateTax <= 0) return 0;

    let coloradoStateTaxRate = COLORADO_STATE_TAX_RATE; // Use the new single constant

    let retirementIncomeDeduction = 0;
    let incomeSubjectToTax = totalIncomeForStateTax;

    // Logic for full deduction of federally taxable Social Security for 65+
    if (robAge >= 65 || sonjaAge >= 65) {
        incomeSubjectToTax = Math.max(0, incomeSubjectToTax - federallyTaxableSS);
        // After deducting full taxable SS, then apply the general retirement income deduction
        retirementIncomeDeduction = 24000;
    } else if (robAge >= 55 || sonjaAge >= 55) {
        retirementIncomeDeduction = 20000;
    }

    let incomeAfterCODRetirementDeduction = Math.max(0, incomeSubjectToTax - retirementIncomeDeduction);

    return incomeAfterCODRetirementDeduction * coloradoStateTaxRate;
}


let projectionData = [];

function calculateRetirement() {
    const robBirthDate = parseDate(document.getElementById('robBirthDate').value);
    const sonjaBirthDate = parseDate(document.getElementById('sonjaBirthDate').value);
    let initialSavingsInput = parseFloat(document.getElementById('initialSavings').value);
    const retirementAgeRob = parseInt(document.getElementById('retirementAge').value);
    const retirementAgeSonja = parseInt(document.getElementById('partnerRetirementAge').value);
    const planToAge = parseInt(document.getElementById('planToAge').value); // This is the key input for the change
    const monthlyInvestmentContribution = parseFloat(document.getElementById('monthlyInvestmentContribution').value);
    const averageMarketReturn = parseFloat(document.getElementById('averageMarketReturn').value) / 100;
    const postRetirementGrowthRate = parseFloat(document.getElementById('postRetirementGrowthRate').value) / 100;
    const annualInflationRate = parseFloat(document.getElementById('annualInflationRate').value) / 100;
    let robCurrentSalary = parseFloat(document.getElementById('robCurrentSalary').value);
    const salaryGrowthRate = parseFloat(document.getElementById('salaryGrowthRate').value) / 100;
    let sonjaCurrentSalary = parseFloat(document.getElementById('sonjaCurrentSalary').value);
    const robSocialSecurityMonthly = parseFloat(document.getElementById('robSocialSecurityMonthly').value);
    const robSocialSecurityStartAge = parseInt(document.getElementById('robSocialSecurityStartAge').value);
    const sonjaSocialSecurityMonthly = parseFloat(document.getElementById('sonjaSocialSecurityMonthly').value);
    const sonjaSocialSecurityStartAge = parseInt(document.getElementById('sonjaSocialSecurityStartAge').value);
    const initialOtherMonthlyIncome = parseFloat(document.getElementById('otherMonthlyIncome').value);
    const peraAnnualIncreaseRate = parseFloat(document.getElementById('peraAnnualIncreaseRate').value) / 100;
    const peraAIWaitMonths = parseInt(document.getElementById('peraAIWaitMonths').value);

    let monthlyRetirementSpending = parseFloat(document.getElementById('monthlyRetirementSpending').value);
    const goGoMonthlySpending = parseFloat(document.getElementById('goGoMonthlySpending').value);
    const goGoStartAge = parseInt(document.getElementById('goGoStartAge').value);
    const goGoEndAge = parseInt(document.getElementById('goGoEndAge').value);
    const goSlowMonthlySpending = parseFloat(document.getElementById('goSlowMonthlySpending').value);
    const goSlowStartAge = parseInt(document.getElementById('goSlowStartAge').value);
    const goSlowEndAge = parseInt(document.getElementById('goSlowEndAge').value);

    const filingStatus = document.getElementById('filingStatus').value;
    const calculateInTodayDollars = document.getElementById('calculateInTodayDollars').checked;

    const overrideRobAge = document.getElementById('overrideCurrentAge').value ? parseInt(document.getElementById('overrideCurrentAge').value) : null;
    const overrideSonjaAge = document.getElementById('overridePartnerCurrentAge').value ? parseInt(document.getElementById('overridePartnerCurrentAge').value) : null;

    projectionData = [];
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    resultsTableBody.innerHTML = '';

    let currentSavings = initialSavingsInput;
    const today = new Date();
    const currentYear = today.getFullYear();

    let robInitialAge = calculateAge(robBirthDate, today);
    let sonjaInitialAge = calculateAge(sonjaBirthDate, today);

    robInitialAge = overrideRobAge !== null ? overrideRobAge : robInitialAge;
    sonjaInitialAge = overrideSonjaAge !== null ? overrideSonjaAge : sonjaInitialAge;

    let robAgeAtEndOfPlan = robInitialAge;
    let sonjaAgeAtEndOfPlan = sonjaInitialAge;
    let firstShortfallYear = '--';
    let balanceAtRobRetirement = '--';

    let robRetirementBalanceCaptured = false;

    // --- New variables for pension management ---
    let actualPensionStartYear = null; // Stores the calendar year the pension begins
    // This will hold the nominal value of the pension for the *current* year's calculation
    // It's initialized to 0 and set/updated within the loop.
    let annualPensionIncomeNominal = 0;

    for (let year = currentYear; ; year++) { // Changed to an infinite loop
        const robAge = year - currentYear + robInitialAge;
        const sonjaAge = year - currentYear + sonjaInitialAge;

        // Stop condition based on planToAge (max age)
        if (robAge > planToAge && sonjaAge > planToAge) {
            break;
        }

        robAgeAtEndOfPlan = robAge;
        sonjaAgeAtEndOfPlan = sonjaAge;

        // MODIFIED LOGIC: Capture the balance at the end of the year Rob *is* his retirement age
        if (!robRetirementBalanceCaptured && robAge === retirementAgeRob) {
            balanceAtRobRetirement = currentSavings;
            robRetirementBalanceCaptured = true;
        }

        let savingsAtBeginningOfYear = currentSavings;
        let currentYearInflationFactor = Math.pow(1 + annualInflationRate, year - currentYear);

        let annualGrowthRate = averageMarketReturn;
        let annualContribution = monthlyInvestmentContribution * 12;
        let currentYearRobSalary = robCurrentSalary;
        let currentYearSonjaSalary = sonjaCurrentSalary;

        if (robAge < retirementAgeRob) {
            robCurrentSalary *= (1 + salaryGrowthRate);
        } else {
            currentYearRobSalary = 0;
        }

        if (sonjaAge < retirementAgeSonja) {
            sonjaCurrentSalary *= (1 + salaryGrowthRate);
        } else {
            currentYearSonjaSalary = 0;
        }

        if (robAge >= retirementAgeRob && sonjaAge >= retirementAgeSonja) {
            annualGrowthRate = postRetirementGrowthRate;
            annualContribution = 0;
        }

        let currentYearRobSocialSecurity = 0;
        if (robAge >= robSocialSecurityStartAge) {
            currentYearRobSocialSecurity = robSocialSecurityMonthly * 12 * Math.pow(1 + annualInflationRate, year - currentYear);
        }

        let currentYearSonjaSocialSecurity = 0;
        if (sonjaAge >= sonjaSocialSecurityStartAge) {
            currentYearSonjaSocialSecurity = sonjaSocialSecurityMonthly * 12 * Math.pow(1 + annualInflationRate, year - currentYear);
        }

        // --- Pension Income Calculation (Corrected Timing and Value Logic) ---
        // Reset for the current year's calculation
        annualPensionIncomeNominal = 0;

        if (initialOtherMonthlyIncome > 0) {
            if (robAge >= retirementAgeRob) { // Pension is eligible to start for Rob
                if (actualPensionStartYear === null) {
                    // This is the first year the pension is received
                    actualPensionStartYear = year;
                    // Initial nominal value: today's dollar amount, inflated to the current year
                    annualPensionIncomeNominal = initialOtherMonthlyIncome * 12 * currentYearInflationFactor;
                } else {
                    // Pension has already started in a previous year
                    const yearsSincePensionStart = year - actualPensionStartYear;
                    const yearsWaitPeriod = Math.ceil(peraAIWaitMonths / 12);

                    if (peraAnnualIncreaseRate > 0 && yearsSincePensionStart >= yearsWaitPeriod) {
                        // PERA AI applies:
                        // The base for PERA AI compounding is the initial "today's dollars" amount
                        let baseForPeraCompounding = initialOtherMonthlyIncome * 12;
                        // Calculate how many full years the PERA AI has applied to the pension
                        const peraAITimesApplied = yearsSincePensionStart - yearsWaitPeriod;

                        // The nominal value will be the initial base (inflated to start year)
                        // and then compounded by PERA AI from its eligibility year.
                        let nominalValueAtAIBeginning = initialOtherMonthlyIncome * 12 * Math.pow(1 + annualInflationRate, actualPensionStartYear - currentYear);

                        // Apply PERA AI. If peraAITimesApplied is 0, it means it's the first year of AI eligibility.
                        // So, the power should be `peraAITimesApplied + 1` for compounding logic.
                        annualPensionIncomeNominal = nominalValueAtAIBeginning * Math.pow(1 + peraAnnualIncreaseRate, peraAITimesApplied + 1);

                    } else {
                        // Before PERA AI starts, or if PERA AI rate is 0, the pension simply inflates with general inflation
                        annualPensionIncomeNominal = initialOtherMonthlyIncome * 12 * currentYearInflationFactor;
                    }
                }
            }
        }
        // `annualPensionIncomeNominal` is now the correct nominal value for this year's pension
        // Use this for `currentYearPensionIncome` variable that goes into the rest of the calculations.
        const currentYearPensionIncome = annualPensionIncomeNominal; // Consolidate into existing variable name


        const totalSocialSecurityIncome = currentYearRobSocialSecurity + currentYearSonjaSocialSecurity;

        // --- Expense Calculations (input is in today's dollars, so inflate for current year's nominal needs) ---
        let annualSpendingBase = monthlyRetirementSpending * 12;

        if ((robAge >= goGoStartAge && robAge <= goGoEndAge) || (sonjaAge >= goGoStartAge && sonjaAge <= goGoEndAge)) {
            annualSpendingBase += goGoMonthlySpending * 12;
        }
        if ((robAge >= goSlowStartAge && robAge >= goSlowEndAge) || (sonjaAge >= goSlowStartAge && sonjaAge <= goSlowEndAge)) {
            annualSpendingBase += goSlowMonthlySpending * 12;
        }

        const inflatedAnnualSpending = annualSpendingBase * currentYearInflationFactor;

        // --- Calculate Initial Income & Deficit (BEFORE considering withdrawals as income) ---
        // This is the income generated that is *naturally* taxable (salary, pension, SS before withdrawal consideration)
        let initialTaxableIncomeFederal = currentYearRobSalary + currentYearSonjaSalary + currentYearPensionIncome;
        let initialTaxableSocialSecurityFederal = calculateTaxableSocialSecurity(totalSocialSecurityIncome, initialTaxableIncomeFederal, filingStatus);

        // Total income for federal tax before deductions and any withdrawals
        let initialIncomeForFederalTaxCalculation = initialTaxableIncomeFederal + initialTaxableSocialSecurityFederal;

        // Gross income for state tax (salary + pension + full SS)
        // This is the income that would be considered for state tax *before* any state-specific deductions.
        let initialTotalGrossIncomeNominal = currentYearRobSalary + currentYearSonjaSalary + totalSocialSecurityIncome + currentYearPensionIncome;

        // Calculate initial taxes based only on salary, pension, and SS
        let annualFederalTaxes = calculateFederalIncomeTax(initialIncomeForFederalTaxCalculation, filingStatus);
        // MODIFIED: Pass federally taxable SS to Colorado tax calculation
        let annualColoradoStateTaxes = calculateColoradoStateTax(initialTotalGrossIncomeNominal, robAge, sonjaAge, year, initialTaxableSocialSecurityFederal);
        let totalAnnualTax = annualFederalTaxes + annualColoradoStateTaxes;

        // --- SIMPLIFIED WITHDRAWAL AND TAX LOGIC (PRE-RMD, PRE-ITERATIVE) ---
        let cashFlowBeforeWithdrawals = initialTotalGrossIncomeNominal + annualContribution - inflatedAnnualSpending - totalAnnualTax;

        let withdrawalsToCoverDeficit = 0;
        let actualWithdrawalsForDisplay = 0;
        let shortfall = 0;

        if (cashFlowBeforeWithdrawals < 0) {
            // Initial deficit based on current income and taxes
            withdrawalsToCoverDeficit = Math.abs(cashFlowBeforeWithdrawals);

            // Re-calculate taxes assuming these withdrawals are also taxable
            let estimatedTaxableIncomeFederal = initialTaxableIncomeFederal + withdrawalsToCoverDeficit;
            let estimatedTaxableSocialSecurityFederal = calculateTaxableSocialSecurity(totalSocialSecurityIncome, estimatedTaxableIncomeFederal, filingStatus);
            let estimatedTotalFederalTaxBase = currentYearRobSalary + currentYearSonjaSalary + currentYearPensionIncome + withdrawalsToCoverDeficit + estimatedTaxableSocialSecurityFederal;

            let estimatedTotalGrossIncomeNominal = initialTotalGrossIncomeNominal + withdrawalsToCoverDeficit;

            let newFederalTax = calculateFederalIncomeTax(estimatedTotalFederalTaxBase, filingStatus);
            let newColoradoTax = calculateColoradoStateTax(estimatedTotalGrossIncomeNominal, robAge, sonjaAge, year, estimatedTaxableSocialSecurityFederal);
            let newTotalTax = newFederalTax + newColoradoTax;

            // Adjust withdrawals to cover expenses + *new* taxes
            withdrawalsToCoverDeficit = (inflatedAnnualSpending + newTotalTax) - (initialTotalGrossIncomeNominal + annualContribution);
            
            // Ensure withdrawals are not negative and update totalAnnualTax for display
            withdrawalsToCoverDeficit = Math.max(0, withdrawalsToCoverDeficit);
            totalAnnualTax = newTotalTax; // Use the re-calculated tax
        }

        // --- Final Cash Flow and Savings Update ---
        let investmentGrowthAmount = savingsAtBeginningOfYear * annualGrowthRate;
        let currentSavingsBeforeSpendingAndTaxes = savingsAtBeginningOfYear + investmentGrowthAmount + annualContribution;

        // If currentSavingsBeforeSpendingAndTaxes cannot cover the required withdrawals:
        if (withdrawalsToCoverDeficit > currentSavingsBeforeSpendingAndTaxes) {
            // Not enough savings to cover the required withdrawals
            actualWithdrawalsForDisplay = currentSavingsBeforeSpendingAndTaxes; // Withdraw everything available
            shortfall = withdrawalsToCoverDeficit - currentSavingsBeforeSpendingAndTaxes;
            currentSavings = 0; // Savings depleted
            if (firstShortfallYear === '--') {
                firstShortfallYear = year;
            }
        } else {
            actualWithdrawalsForDisplay = withdrawalsToCoverDeficit;
            currentSavings = currentSavingsBeforeSpendingAndTaxes - actualWithdrawalsForDisplay;
        }

        // --- Total Income for Display (Nominal) ---
        // This should reflect all sources of income, including the portion of savings that was effectively withdrawn and taxed.
        // The total income for display should be the sum of:
        // (Salary + Social Security + Pension) + Actual Withdrawals Taxed
        let totalIncomeForDisplayNominal = currentYearRobSalary + currentYearSonjaSalary + totalSocialSecurityIncome + currentYearPensionIncome + actualWithdrawalsForDisplay;

        // Store results for the table and CSV.
        const displayInflationFactor = calculateInTodayDollars ? currentYearInflationFactor : 1;

        const rowData = {
            year: year,
            robAge: robAge,
            sonjaAge: sonjaAge,
            savingsStart: savingsAtBeginningOfYear / displayInflationFactor,
            contribution: annualContribution / displayInflationFactor,
            investmentGrowth: investmentGrowthAmount / displayInflationFactor,
            socialSecurityIncome: totalSocialSecurityIncome / displayInflationFactor,
            pensionIncome: currentYearPensionIncome / displayInflationFactor, // This division will now correctly de-inflate the nominal pension value
            totalIncome: totalIncomeForDisplayNominal / displayInflationFactor, // Now includes actual withdrawals that were taxed
            totalExpenses: inflatedAnnualSpending / displayInflationFactor,
            totalTax: totalAnnualTax / displayInflationFactor,
            withdrawals: actualWithdrawalsForDisplay / displayInflationFactor,
            savingsEnd: currentSavings / displayInflationFactor,
            shortfall: shortfall / displayInflationFactor
        };
        projectionData.push(rowData);

        // Existing shortfall break condition, this will stop if a shortfall occurs even before planToAge
        if (shortfall > 0 && year >= robAge) {
            break;
        }
    } // End of for loop

    let displayBalanceAtRobRetirement = balanceAtRobRetirement;
    if (calculateInTodayDollars && displayBalanceAtRobRetirement !== '--') {
        // Corrected inflation factor calculation for the year Rob *is* their retirement age
        const yearRobAtRetirementAge = currentYear + (retirementAgeRob - robInitialAge);
        const inflationFactorAtRobRetirement = Math.pow(1 + annualInflationRate, yearRobAtRetirementAge - currentYear);
        displayBalanceAtRobRetirement /= inflationFactorAtRobRetirement;
    }

    let displayFinalBalance = currentSavings;
    if (calculateInTodayDollars) {
        const lastDataRow = projectionData[projectionData.length - 1];
        if (lastDataRow) {
            const finalYear = lastDataRow.year;
            const finalYearInflationFactor = Math.pow(1 + annualInflationRate, finalYear - currentYear);
            displayFinalBalance /= finalYearInflationFactor;
        }
    }

    displayResults(projectionData, robAgeAtEndOfPlan, sonjaAgeAtEndOfPlan, displayBalanceAtRobRetirement, displayFinalBalance, firstShortfallYear);
}

function displayResults(data, finalRobAge, finalSonjaAge, balanceAtRobRetirement, finalBalance, firstShortfallYear) {
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    resultsTableBody.innerHTML = '';

    const formatCurrency = (value) => {
        if (typeof value !== 'number' || isNaN(value)) {
            return '--';
        }
        return Math.round(value).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    };

    data.forEach(row => {
        const tr = document.createElement('tr');
        if (row.shortfall > 0) {
            tr.classList.add('shortfall-row');
        }

        tr.innerHTML = `
            <td>${row.year}</td>
            <td>${row.robAge}</td>
            <td>${row.sonjaAge}</td>
            <td>${formatCurrency(row.savingsStart)}</td>
            <td>${formatCurrency(row.contribution)}</td>
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
        resultsTableBody.appendChild(tr);
    });

    document.getElementById('summaryRobAge').textContent = finalRobAge;
    document.getElementById('summarySonjaAge').textContent = finalSonjaAge;
    document.getElementById('balanceAtRobRetirement').textContent = formatCurrency(balanceAtRobRetirement);
    document.getElementById('balanceAtEndOfPlan').textContent = formatCurrency(finalBalance);
    document.getElementById('shortfallYear').textContent = firstShortfallYear;
}


function exportToCsv() {
    if (projectionData.length === 0) {
        alert('Please run the calculation first to generate data.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";

    csvContent += "Input Parameters\n";
    const inputs = [
        ["Your Birth Date", document.getElementById('robBirthDate').value],
        ["Partner's Birth Date", document.getElementById('sonjaBirthDate').value],
        ["Current Savings/Investments ($)", document.getElementById('initialSavings').value],
        ["Your Desired Retirement Age", document.getElementById('retirementAge').value],
        ["Partner's Desired Retirement Age", document.getElementById('partnerRetirementAge').value],
        ["Life Expectancy for Projection (max age)", document.getElementById('planToAge').value],
        ["Simulate Your Current Age (Optional)", document.getElementById('overrideCurrentAge').value || "N/A"],
        ["Simulate Partner's Current Age (Optional)", document.getElementById('overridePartnerCurrentAge').value || "N/A"],
        ["Annual Pre-Retirement Growth Rate (%)", document.getElementById('averageMarketReturn').value],
        ["Annual Post-Retirement Growth Rate (%)", document.getElementById('postRetirementGrowthRate').value],
        ["Annual Inflation Rate (%)", document.getElementById('annualInflationRate').value],
        ["Tax Filing Status", document.getElementById('filingStatus').value],
        ["Calculate in Today's Dollars (Adjust for inflation)", document.getElementById('calculateInTodayDollars').checked ? 'Yes' : 'No'],
        ["Monthly Investment Contribution ($)", document.getElementById('monthlyInvestmentContribution').value],
        ["Your Current Annual Salary ($)", document.getElementById('robCurrentSalary').value],
        ["Annual Salary Growth Rate (%)", document.getElementById('salaryGrowthRate').value],
        ["Partner's Current Annual Salary ($)", document.getElementById('sonjaCurrentSalary').value],
        ["Your Monthly Social Security ($)", document.getElementById('robSocialSecurityMonthly').value],
        ["Your SS Start Age", document.getElementById('robSocialSecurityStartAge').value],
        ["Partner's Monthly Social Security ($)", document.getElementById('sonjaSocialSecurityMonthly').value],
        ["Partner's SS Start Age", document.getElementById('sonjaSocialSecurityStartAge').value],
        ["Other Monthly Income (e.g., pension, annuity) ($)", document.getElementById('otherMonthlyIncome').value],
        ["Colorado PERA Annual Increase Rate (%)", document.getElementById('peraAnnualIncreaseRate').value],
        ["Colorado PERA AI Waiting Period (Months after retirement)", document.getElementById('peraAIWaitMonths').value],
        ["Base Living Expenses (Monthly, in today's dollars)", document.getElementById('monthlyRetirementSpending').value],
        ["Go-Go Monthly Spending (Additional) ($)", document.getElementById('goGoMonthlySpending').value],
        ["Go-Go Start Age", document.getElementById('goGoStartAge').value],
        ["Go-Go End Age", document.getElementById('goGoEndAge').value],
        ["Go-Slow Monthly Spending (Additional) ($)", document.getElementById('goSlowMonthlySpending').value],
        ["Go-Slow Start Age", document.getElementById('goSlowStartAge').value],
        ["Go-Slow End Age", document.getElementById('goSlowEndAge').value]
    ];

    inputs.forEach(input => {
        const value = String(input[1]).includes(',') ? `"${input[1]}"` : input[1];
        csvContent += `"${input[0]}",${value}\n`;
    });
    csvContent += "\n";

    const headers = ["Year", "Your Age", "Partner Age", "Savings Start ($)", "Contrib. ($)", "Inv. Growth ($)", "Social Security Income ($)", "Pension Income ($)", "Total Income ($)", "Total Exp. ($)", "Total Tax ($)", "Withdrawals ($)", "Savings End ($)", "Shortfall ($)"];
    csvContent += headers.join(",") + "\n";

    projectionData.forEach(row => {
        const rowValues = [
            row.year,
            row.robAge,
            row.sonjaAge,
            Math.round(row.savingsStart),
            Math.round(row.contribution),
            Math.round(row.investmentGrowth),
            Math.round(row.socialSecurityIncome),
            Math.round(row.pensionIncome),
            Math.round(row.totalIncome),
            Math.round(row.totalExpenses),
            Math.round(row.totalTax),
            Math.round(row.withdrawals),
            Math.round(row.savingsEnd),
            Math.round(row.shortfall)
        ];
        csvContent += rowValues.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "retirement_projection.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleHelpSection() {
    const helpSection = document.getElementById('helpSection');
    if (helpSection.style.display === 'none' || helpSection.style.display === '') { // Added '' check for initial state
        helpSection.style.display = 'flex';
        // Add scroll behavior here:
        helpSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        helpSection.style.display = 'none';
    }
}
