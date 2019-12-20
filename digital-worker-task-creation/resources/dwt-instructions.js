// Gets the skill to extract data for the loan application form by invoking IBM Business Automation Content Analyzer (BACA)
const contentExtractionSkill = task.getSkill('Extract data from loan application form');

// Gets the skill to check the compliance of the loan by invoking IBM Operational Decision Manager (ODM)
const decisionRulesSkill = task.getSkill('Check compliance');

// Gets the skill to send an email with the loan recommendation
const sendEmailSkill = task.getSkill('Email recommendation');

// Get the guardrail to use in the recommendation to distinguish loans that can be automatically processed
// from those that require further input.
const autoProcessedLoan = task.getGuardrail('Loan Approved Automatically');

// Executes the skill named 'Extract data from loan application form' to extract data from the loan application form
// and formats the data to comply with the 'loan validation' ruleset deployed in ODM.
// The skill named 'Extract data from loan application form' takes as parameter an URL to the loan application form PDF document.
// The URL is passed as an input of the Digital Worker Task.
const loanApplicationData = extractDataFromLoanApplicationForm(await contentExtractionSkill.execute({
    url: task.input.url
}));

// Executes the skill named 'Check compliance' to check the compliance.
const checkComplianceProcessed = await decisionRulesSkill.execute({
    data: loanApplicationData
});

// Logs the output of the invocation of the 'Decision rules' skill
task.context.logger.info(checkComplianceProcessed);

// Formats the the output of the invocation of the 'Decision rules' skill to be consumed
// by the 'Send Emails' skill
const loanRecommendation = formatLoanRecommendationsEmail(checkComplianceProcessed);

// Executes the skill named 'Email recommendation' to send an email with the loan recommendation.
sendEmailSkill.execute(loanRecommendation);

// Returns the loan recommendation
return {
    ...checkComplianceProcessed,
    recommendation: loanRecommendation.text
};

// Utility functions

/**
 * Formats the data extracted by the skill named 'Extract data from loan application form'
 * to comply with the input of the skill 'Check compliance'.
 */
function extractDataFromLoanApplicationForm(input) {
    let odmPayLoad = '{' +
        '  "loan": {' +
        '    "numberOfMonthlyPayments": __numberOfMonthlyPayments__,' +
        '    "startDate": __startDate__,' +
        '    "amount": __amount__,' +
        '    "loanToValue": __loanToValue__' +
        '  },' +
        '  "borrower": {' +
        '    "firstName": __firstName__,' +
        '    "lastName": __lastName__,' +
        '    "birth": __birth__,' +
        '    "SSN": {' +
        '       "areaNumber": __areaNumber__,' +
        '       "groupCode": __groupCode__,' +
        '       "serialNumber": __serialNumber__' +
        '     },' +
        '    "yearlyIncome": __yearlyIncome__,' +
        '    "zipCode": "__zipCode__",' +
        '    "creditScore": __creditScore__,' +
        '    "latestBankruptcy": null' +
        '  }' +
        '}';

    Object.keys(input).map(key => {
        const value = input[key];
        const valNum = Number(value);
        let regEx = new RegExp('__' + key.replace(/\s/g, '') + '__', 'ig');
        odmPayLoad = odmPayLoad.replace(regEx, isNaN(valNum) ? '"' + value + '"' : valNum);
    });
    return JSON.parse(odmPayLoad);
}

/**
 * Formats the data computed by the skill named 'Check compliance'
 * to comply with the input of the skill 'Email recommendation'
 */
function formatLoanRecommendationsEmail(loanRecommendation) {
    const {borrower, loan, approved, message} = loanRecommendation.data.report;
    const recommendation = (approved ?
        (loan.amount < autoProcessedLoan.threshold ?
            `The loan can be automatically approved because the requested amount is below $${autoProcessedLoan.threshold}.` :
            `The loan was approved but requires further input because the requested amount is equal to or above $${autoProcessedLoan.threshold}.`) :
        'The loan was rejected');
    const text = `Loan request submitted on ${new Date()} for customer ${borrower.firstName} ${borrower.lastName}:\n` +
        `    - Amount asked: $${loan.amount}\n` +
        `    - Recommendation: ${recommendation}\n` +
        `    - Explanation: ${message.replace(/(\r\n|\n|\r)/gm, '. ')}`;
    // 'to' and 'from' must be changed to reflect the recipients you are targeting
    return {
        subject: `[Bank Company/Loan Recommendation] Loan application processed for customer ${borrower.firstName} ${borrower.lastName}`,
        to: 'name@example.com',
        from: 'name@example.com',
        text: text
    };
}
