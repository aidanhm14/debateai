/** Run once in Google Apps Script under the intended form owner's account.
 * Re-running returns the same form. Does not submit responses or change user data.
 * The form was created through Google Forms on September 24, 2026.
 * This script opens that existing form, avoiding a duplicate. The script itself was not run.
 */
function createDebatableRoundFeedbackForm() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DEBATABLE_ROUND_FEEDBACK_FORM_ID') || '1VycMQj7kcM8cLGOU-QNoGfNHAt3PFlmToWNIjxQ1BY8';
  var form;
  if (id) form = FormApp.openById(id);
  else {
    form = FormApp.create('Debatable round feedback');
    props.setProperty('DEBATABLE_ROUND_FEEDBACK_FORM_ID', form.getId());
    form.setDescription('Tell us about your round. Do not include passwords, payment details, or private information about another person. Appeals belong on the round decision page.');
    form.setCollectEmail(false);
    form.addTextItem().setTitle('Round id or link (if you have it)');
    form.addScaleItem().setTitle('How useful was this round?').setBounds(1,5).setLabels('Not useful','Very useful');
    form.addMultipleChoiceItem().setTitle('What is your feedback about?').setChoiceValues(['Judge decision','Transcript','AI opponent','Audio or connection','Something else']);
    form.addParagraphTextItem().setTitle('What happened, and what should change?').setRequired(true);
    form.setConfirmationMessage('Thank you. Your feedback has been recorded. To appeal a decision, use the appeal action on your round.');
  }
  console.log('Set ROUND_FEEDBACK_FORM_URL to: ' + form.getPublishedUrl());
  return form.getPublishedUrl();
}
