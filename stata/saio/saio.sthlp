{smcl}
{* *! version 1.0.0 16jul2026}{...}
{title:Title}

{phang}
{bf:saio} {hline 2} Configure Stata All in One from the running Stata application

{title:Syntax}

{p 8 16 2}
{cmd:saio} [{cmd:setup}] [{cmd:,} {opt port(#)} {opt force}]

{p 8 16 2}
{cmd:saio status} [{cmd:,} {opt port(#)}]

{p 8 16 2}
{cmd:saio version}

{title:Description}

{pstd}
{cmd:saio} and {cmd:saio setup} connect to the Stata All in One VS Code
extension on local ports 16886 through 16895.  They first display the
extension's current configuration and then configure the extension using the
currently running Stata installation.

{pstd}
If the extension is already configured, {cmd:saio setup} asks for confirmation
before sending any configuration request.  Press Enter or answer {cmd:n} to
keep the existing configuration.

{pstd}
{cmd:saio status} displays the current configuration without changing it.
{cmd:saio version} displays the command and protocol versions.

{title:Options}

{phang}
{opt port(#)} connects to a specific port from 16886 through 16895 instead of
scanning the range.

{phang}
{opt force} skips the confirmation when an existing configuration is found.
The current configuration is still displayed before setup.  This option is
available only with {cmd:saio setup}.

{title:Examples}

{phang2}{cmd:. saio setup}{p_end}
{phang2}{cmd:. saio status}{p_end}
{phang2}{cmd:. saio setup, force}{p_end}
{phang2}{cmd:. saio setup, port(16887)}{p_end}

{title:Requirements}

{pstd}
Stata 13 or newer on Windows or macOS.  VS Code with Stata All in One must be
running on the same computer.  Run {cmd:saio} in a separately opened Stata
application, not in the VS Code Embedded Console.
