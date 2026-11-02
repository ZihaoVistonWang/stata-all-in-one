// These describe meaning, never a color or the operating system displaying it.
const ROLE_SCOPES = Object.freeze({
    command: ['source.stata', 'keyword.functions.data.stata'],
    keyword: ['source.stata', 'keyword.control.conditional.stata'],
    string: ['source.stata', 'string.quoted.double.stata'],
    path: ['source.stata', 'string.quoted.double.stata'],
    number: ['source.stata', 'constant.numeric.stata'],
    comment: ['source.stata', 'comment.line.star.stata'],
    function: ['source.stata', 'support.function.builtin.stata'],
    option: ['source.stata', 'support.function.custom.stata'],
    variable: ['source.stata', 'variable.parameter.function.stata'],
    macro: ['source.stata', 'entity.name.type.class.stata'],
    operator: ['source.stata', 'keyword.operator.assignment.stata']
});
const REFRESH_THEME_COMMAND = 'stata-all-in-one.refreshClientTheme';
module.exports = { ROLE_SCOPES, REFRESH_THEME_COMMAND };
