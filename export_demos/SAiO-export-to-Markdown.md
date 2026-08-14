This result file was exported by [Stata All in One](https://marketplace.visualstudio.com/items?itemName=ZihaoVistonWang.stata-all-in-one).

> ```stata
> ** ==================================================
> // Stata All in One - Feature Showcase
> ** ==================================================
> 
> **# Data Preparation
> // Load example dataset
> sysuse auto, clear
> 
> // Basic data exploration
> describe
> summarize price mpg weight, detail
> 
> **## Data Cleaning
> // Handle missing values
> drop if missing(rep78)
> 
> // Create new variables
> gen log_price = log(price)
> gen weight_kg = weight * 0.453592
> 
> **## Descriptive Statistics
> // Summary statistics by groups
> tabstat price mpg weight, by(foreign) stat(mean sd min max)
> 
> // Correlation matrix
> correlate price mpg weight length
> 
> **# Regression Analysis
> **## Basic OLS Regression
> 
> // Simple regression
> reg price mpg weight
> 
> // Store results for comparison
> estimates store model1
> 
> **## Fixed Effects with reghdfe
> /* This command demonstrates custom syntax highlighting
>    reghdfe is a third-party command that's highlighted by default */
>    
> reghdfe price mpg weight, absorb(foreign) vce(robust)
> estimates store model2
> 
> **# Data Visualization
> **## Scatter Plots with Fit Lines
> twoway (scatter price mpg) (lfit price mpg), ///
> 	title("Price vs MPG") ///
> 	xtitle("Miles per Gallon") ///
> 	ytitle("Price (USD)")
> 
> 
> **# Export Results
> 
> // Export summary table
> eststo clear
> eststo: quietly reg price mpg weight
> eststo: quietly reg price mpg weight, robust
> esttab using "results.csv", replace csv
> 
> // Save cleaned dataset
> save "auto_cleaned.dta", replace
> 
> **# Notes & Tips
> 
> /* Feature Highlights:
>    1. Use Ctrl/Cmd + 1-6 to set heading levels
>    2. Press Ctrl/Cmd + D to run current section
>    3. Use Ctrl/Cmd + / to toggle comments
>    4. Try Ctrl/Cmd + = to insert separator lines
>    5. Custom commands like 'reghdfe' are highlighted automatically
>    
>    Navigation Tips:
>    - Click on any section in the Outline panel to jump there
>    - Enable "Follow Cursor" in Outline view for auto-sync
>    - Use numbering in settings for hierarchical structure
> */
> 
> // End of demonstration file
> ```

```text

. ** ==================================================
. // Stata All in One - Feature Showcase
. ** ==================================================
. 
. **# Data Preparation
. // Load example dataset
. sysuse auto, clear
(1978 automobile data)

. 
. // Basic data exploration
. describe

Contains data from /Applications/StataNow/ado/base/a/auto.dta
 Observations:            74                  1978 automobile data
    Variables:            12                  13 Apr 2024 17:45
                                              (_dta has notes)
----------------------------------------------------------------------------------------
Variable      Storage   Display    Value
    name         type    format    label      Variable label
----------------------------------------------------------------------------------------
make            str18   %-18s                 Make and model
price           int     %8.0gc                Price
mpg             int     %8.0g                 Mileage (mpg)
rep78           int     %8.0g                 Repair record 1978
headroom        float   %6.1f                 Headroom (in.)
trunk           int     %8.0g                 Trunk space (cu. ft.)
weight          int     %8.0gc                Weight (lbs.)
length          int     %8.0g                 Length (in.)
turn            int     %8.0g                 Turn circle (ft.)
displacement    int     %8.0g                 Displacement (cu. in.)
gear_ratio      float   %6.2f                 Gear ratio
foreign         byte    %8.0g      origin     Car origin
----------------------------------------------------------------------------------------
Sorted by: foreign

. summarize price mpg weight, detail

                            Price
-------------------------------------------------------------
      Percentiles      Smallest
 1%         3291           3291
 5%         3748           3299
10%         3895           3667       Obs                  74
25%         4195           3748       Sum of wgt.          74

50%       5006.5                      Mean           6165.257
                        Largest       Std. dev.      2949.496
75%         6342          13466
90%        11385          13594       Variance        8699526
95%        13466          14500       Skewness       1.653434
99%        15906          15906       Kurtosis       4.819188

                        Mileage (mpg)
-------------------------------------------------------------
      Percentiles      Smallest
 1%           12             12
 5%           14             12
10%           14             14       Obs                  74
25%           18             14       Sum of wgt.          74

50%           20                      Mean            21.2973
                        Largest       Std. dev.      5.785503
75%           25             34
90%           29             35       Variance       33.47205
95%           34             35       Skewness       .9487176
99%           41             41       Kurtosis       3.975005

                        Weight (lbs.)
-------------------------------------------------------------
      Percentiles      Smallest
 1%         1760           1760
 5%         1830           1800
10%         2020           1800       Obs                  74
25%         2240           1830       Sum of wgt.          74

50%         3190                      Mean           3019.459
                        Largest       Std. dev.      777.1936
75%         3600           4290
90%         4060           4330       Variance       604029.8
95%         4290           4720       Skewness       .1481164
99%         4840           4840       Kurtosis       2.118403

. 
. **## Data Cleaning
. // Handle missing values
. drop if missing(rep78)
(5 observations deleted)

. 
. // Create new variables
. gen log_price = log(price)

. gen weight_kg = weight * 0.453592

. 
. **## Descriptive Statistics
. // Summary statistics by groups
. tabstat price mpg weight, by(foreign) stat(mean sd min max)

Summary statistics: Mean, SD, Min, Max
Group variable: foreign (Car origin)

 foreign |     price       mpg    weight
---------+------------------------------
Domestic |   6179.25  19.54167  3368.333
         |  3188.969  4.753312  688.0108
         |      3291        12      1800
         |     15906        34      4840
---------+------------------------------
 Foreign |  6070.143  25.28571  2263.333
         |  2220.984  6.309856  364.7099
         |      3748        17      1760
         |     11995        41      3170
---------+------------------------------
   Total |  6146.043  21.28986  3032.029
         |   2912.44  5.866408  792.8515
         |      3291        12      1760
         |     15906        41      4840
----------------------------------------

. 
. // Correlation matrix
. correlate price mpg weight length
(obs=69)

             |    price      mpg   weight   length
-------------+------------------------------------
       price |   1.0000
         mpg |  -0.4559   1.0000
      weight |   0.5478  -0.8055   1.0000
      length |   0.4425  -0.8037   0.9478   1.0000


. 
. **# Regression Analysis
. **## Basic OLS Regression
. 
. // Simple regression
. reg price mpg weight

      Source |       SS           df       MS      Number of obs   =        69
-------------+----------------------------------   F(2, 66)        =     14.19
       Model |   173465736         2    86732868   Prob > F        =    0.0000
    Residual |   403331223        66  6111079.13   R-squared       =    0.3007
-------------+----------------------------------   Adj R-squared   =    0.2795
       Total |   576796959        68  8482308.22   Root MSE        =    2472.1

------------------------------------------------------------------------------
       price | Coefficient  Std. err.      t    P>|t|     [95% conf. interval]
-------------+----------------------------------------------------------------
         mpg |   -20.7178   86.23695    -0.24   0.811    -192.8954    151.4598
      weight |   1.888939   .6380781     2.96   0.004     .6149747    3.162903
       _cons |   859.8055   3595.098     0.24   0.812    -6318.039     8037.65
------------------------------------------------------------------------------

. 
. // Store results for comparison
. estimates store model1

. 
. **## Fixed Effects with reghdfe
. /* This command demonstrates custom syntax highlighting
>    reghdfe is a third-party command that's highlighted by default */
.    
. reghdfe price mpg weight, absorb(foreign) vce(robust)
(MWFE estimator converged in 1 iterations)

HDFE Linear regression                            Number of obs   =         69
Absorbing 1 HDFE group                            F(   2,     65) =      19.50
                                                  Prob > F        =     0.0000
                                                  R-squared       =     0.4961
                                                  Adj R-squared   =     0.4729
                                                  Within R-sq.    =     0.4960
                                                  Root MSE        =  2114.5303

------------------------------------------------------------------------------
             |               Robust
       price | Coefficient  std. err.      t    P>|t|     [95% conf. interval]
-------------+----------------------------------------------------------------
         mpg |   34.34102   80.54482     0.43   0.671    -126.5181    195.2001
      weight |   3.606288   .8076414     4.47   0.000     1.993317    5.219259
       _cons |  -5519.441    3844.32    -1.44   0.156    -13197.08    2158.197
------------------------------------------------------------------------------

Absorbed degrees of freedom:
-----------------------------------------------------+
 Absorbed FE | Categories  - Redundant  = Num. Coefs |
-------------+---------------------------------------|
     foreign |         2           0           2     |
-----------------------------------------------------+

. estimates store model2

. 
. **# Data Visualization
. **## Scatter Plots with Fit Lines
. twoway (scatter price mpg) (lfit price mpg), ///
>         title("Price vs MPG") ///
>         xtitle("Miles per Gallon") ///
>         ytitle("Price (USD)")
. 
. 
. **# Export Results
. 
. // Export summary table
. eststo clear

. eststo: quietly reg price mpg weight
(est1 stored)

. eststo: quietly reg price mpg weight, robust
(est2 stored)

. esttab using "results.csv", replace csv
(file results.csv not found)
(output written to results.csv)

. 
. // Save cleaned dataset
. save "auto_cleaned.dta", replace
(file auto_cleaned.dta not found)
file auto_cleaned.dta saved

. 
. **# Notes & Tips
. 
. /* Feature Highlights:
>    1. Use Ctrl/Cmd + 1-6 to set heading levels
>    2. Press Ctrl/Cmd + D to run current section
>    3. Use Ctrl/Cmd + / to toggle comments
>    4. Try Ctrl/Cmd + = to insert separator lines
>    5. Custom commands like 'reghdfe' are highlighted automatically
>    
>    Navigation Tips:
>    - Click on any section in the Outline panel to jump there
>    - Enable "Follow Cursor" in Outline view for auto-sync
>    - Use numbering in settings for hierarchical structure
> */
. 
. // End of demonstration file
. 
end of do-file
```

![Graph](data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhLS0gVGhpcyBpcyBhIFN0YXRhIDE5LjUgZ2VuZXJhdGVkIFNWRyBmaWxlIChodHRwOi8vd3d3LnN0YXRhLmNvbSkgLS0+Cgo8c3ZnIHZlcnNpb249IjEuMSIgd2lkdGg9IjcuNTAwaW4iIGhlaWdodD0iNC41MDBpbiIgdmlld0JveD0iMCAwIDU0MDAgMzI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+Cgk8ZGVzYz5TdGF0YSBHcmFwaCAtIEdyYXBoPC9kZXNjPgoJPHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjU0MDAiIGhlaWdodD0iMzI0MCIgc3R5bGU9ImZpbGw6I0ZGRkZGRjtzdHJva2U6bm9uZSIvPgoJPHJlY3QgeD0iMC4wMCIgeT0iMC4wMCIgd2lkdGg9IjU0MDAuMDAiIGhlaWdodD0iMzI0MC4wMCIgc3R5bGU9ImZpbGw6I0ZGRkZGRiIvPgoJPHJlY3QgeD0iMy4yNCIgeT0iMy4yNCIgd2lkdGg9IjUzOTMuNTIiIGhlaWdodD0iMzIzMy41MiIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6I0ZGRkZGRjtzdHJva2Utd2lkdGg6Ni40OCIvPgoJPHJlY3QgeD0iNzQ4LjQxIiB5PSIzMDkuODIiIHdpZHRoPSIzMzc3LjM2IiBoZWlnaHQ9IjI0NTYuODMiIHN0eWxlPSJmaWxsOiNGRkZGRkYiLz4KCTxyZWN0IHg9Ijc1MS42NSIgeT0iMzEzLjA2IiB3aWR0aD0iMzM3MC44OCIgaGVpZ2h0PSIyNDUwLjM1IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojRkZGRkZGO3N0cm9rZS13aWR0aDo2LjQ4Ii8+Cgk8bGluZSB4MT0iNzQ4LjQxIiB5MT0iMjY5NS4yOCIgeDI9IjgxMy4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9Ijg0NS42MSIgeTE9IjI2OTUuMjgiIHgyPSI5MTAuNDEiIHkyPSIyNjk1LjI4IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI5NDIuODEiIHkxPSIyNjk1LjI4IiB4Mj0iMTAwNy42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjEwNDAuMDEiIHkxPSIyNjk1LjI4IiB4Mj0iMTEwNC44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjExMzcuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iMTIwMi4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjEyMzQuNDEiIHkxPSIyNjk1LjI4IiB4Mj0iMTI5OS4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjEzMzEuNjEiIHkxPSIyNjk1LjI4IiB4Mj0iMTM5Ni40MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE0MjguODEiIHkxPSIyNjk1LjI4IiB4Mj0iMTQ5My42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE1MjYuMDEiIHkxPSIyNjk1LjI4IiB4Mj0iMTU5MC44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE2MjMuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iMTY4OC4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE3MjAuNDEiIHkxPSIyNjk1LjI4IiB4Mj0iMTc4NS4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE4MTcuNjEiIHkxPSIyNjk1LjI4IiB4Mj0iMTg4Mi40MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE5MTQuODEiIHkxPSIyNjk1LjI4IiB4Mj0iMTk3OS42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjIwMTIuMDEiIHkxPSIyNjk1LjI4IiB4Mj0iMjA3Ni44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjIxMDkuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iMjE3NC4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjIyMDYuNDEiIHkxPSIyNjk1LjI4IiB4Mj0iMjI3MS4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjIzMDMuNjEiIHkxPSIyNjk1LjI4IiB4Mj0iMjM2OC40MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI0MDAuODEiIHkxPSIyNjk1LjI4IiB4Mj0iMjQ2NS42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI0OTguMDEiIHkxPSIyNjk1LjI4IiB4Mj0iMjU2Mi44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI1OTUuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iMjY2MC4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI2OTIuNDEiIHkxPSIyNjk1LjI4IiB4Mj0iMjc1Ny4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI3ODkuNjEiIHkxPSIyNjk1LjI4IiB4Mj0iMjg1NC40MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI4ODYuODEiIHkxPSIyNjk1LjI4IiB4Mj0iMjk1MS42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI5ODQuMDEiIHkxPSIyNjk1LjI4IiB4Mj0iMzA0OC44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjMwODEuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iMzE0Ni4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjMxNzguNDEiIHkxPSIyNjk1LjI4IiB4Mj0iMzI0My4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjMyNzUuNjEiIHkxPSIyNjk1LjI4IiB4Mj0iMzM0MC40MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjMzNzIuODEiIHkxPSIyNjk1LjI4IiB4Mj0iMzQzNy42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM0NzAuMDEiIHkxPSIyNjk1LjI4IiB4Mj0iMzUzNC44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM1NjcuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iMzYzMi4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM2NjQuNDEiIHkxPSIyNjk1LjI4IiB4Mj0iMzcyOS4yMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM3NjEuNjEiIHkxPSIyNjk1LjI4IiB4Mj0iMzgyNi40MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM4NTguODEiIHkxPSIyNjk1LjI4IiB4Mj0iMzkyMy42MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM5NTYuMDEiIHkxPSIyNjk1LjI4IiB4Mj0iNDAyMC44MSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjQwNTMuMjEiIHkxPSIyNjk1LjI4IiB4Mj0iNDExOC4wMSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9Ijc0OC40MSIgeTE9IjE5NjcuNzkiIHgyPSI4MTMuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4NDUuNjEiIHkxPSIxOTY3Ljc5IiB4Mj0iOTEwLjQxIiB5Mj0iMTk2Ny43OSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iOTQyLjgxIiB5MT0iMTk2Ny43OSIgeDI9IjEwMDcuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxMDQwLjAxIiB5MT0iMTk2Ny43OSIgeDI9IjExMDQuODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxMTM3LjIxIiB5MT0iMTk2Ny43OSIgeDI9IjEyMDIuMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxMjM0LjQxIiB5MT0iMTk2Ny43OSIgeDI9IjEyOTkuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxMzMxLjYxIiB5MT0iMTk2Ny43OSIgeDI9IjEzOTYuNDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxNDI4LjgxIiB5MT0iMTk2Ny43OSIgeDI9IjE0OTMuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxNTI2LjAxIiB5MT0iMTk2Ny43OSIgeDI9IjE1OTAuODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxNjIzLjIxIiB5MT0iMTk2Ny43OSIgeDI9IjE2ODguMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxNzIwLjQxIiB5MT0iMTk2Ny43OSIgeDI9IjE3ODUuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODE3LjYxIiB5MT0iMTk2Ny43OSIgeDI9IjE4ODIuNDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxOTE0LjgxIiB5MT0iMTk2Ny43OSIgeDI9IjE5NzkuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyMDEyLjAxIiB5MT0iMTk2Ny43OSIgeDI9IjIwNzYuODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyMTA5LjIxIiB5MT0iMTk2Ny43OSIgeDI9IjIxNzQuMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyMjA2LjQxIiB5MT0iMTk2Ny43OSIgeDI9IjIyNzEuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyMzAzLjYxIiB5MT0iMTk2Ny43OSIgeDI9IjIzNjguNDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyNDAwLjgxIiB5MT0iMTk2Ny43OSIgeDI9IjI0NjUuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyNDk4LjAxIiB5MT0iMTk2Ny43OSIgeDI9IjI1NjIuODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyNTk1LjIxIiB5MT0iMTk2Ny43OSIgeDI9IjI2NjAuMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyNjkyLjQxIiB5MT0iMTk2Ny43OSIgeDI9IjI3NTcuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyNzg5LjYxIiB5MT0iMTk2Ny43OSIgeDI9IjI4NTQuNDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyODg2LjgxIiB5MT0iMTk2Ny43OSIgeDI9IjI5NTEuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTg0LjAxIiB5MT0iMTk2Ny43OSIgeDI9IjMwNDguODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzMDgxLjIxIiB5MT0iMTk2Ny43OSIgeDI9IjMxNDYuMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzMTc4LjQxIiB5MT0iMTk2Ny43OSIgeDI9IjMyNDMuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzMjc1LjYxIiB5MT0iMTk2Ny43OSIgeDI9IjMzNDAuNDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzMzcyLjgxIiB5MT0iMTk2Ny43OSIgeDI9IjM0MzcuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzNDcwLjAxIiB5MT0iMTk2Ny43OSIgeDI9IjM1MzQuODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzNTY3LjIxIiB5MT0iMTk2Ny43OSIgeDI9IjM2MzIuMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzNjY0LjQxIiB5MT0iMTk2Ny43OSIgeDI9IjM3MjkuMjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzNzYxLjYxIiB5MT0iMTk2Ny43OSIgeDI9IjM4MjYuNDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzODU4LjgxIiB5MT0iMTk2Ny43OSIgeDI9IjM5MjMuNjEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTU2LjAxIiB5MT0iMTk2Ny43OSIgeDI9IjQwMjAuODEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI0MDUzLjIxIiB5MT0iMTk2Ny43OSIgeDI9IjQxMTguMDEiIHkyPSIxOTY3Ljc5IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI3NDguNDEiIHkxPSIxMjQwLjMxIiB4Mj0iODEzLjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODQ1LjYxIiB5MT0iMTI0MC4zMSIgeDI9IjkxMC40MSIgeTI9IjEyNDAuMzEiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9Ijk0Mi44MSIgeTE9IjEyNDAuMzEiIHgyPSIxMDA3LjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTA0MC4wMSIgeTE9IjEyNDAuMzEiIHgyPSIxMTA0LjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTEzNy4yMSIgeTE9IjEyNDAuMzEiIHgyPSIxMjAyLjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTIzNC40MSIgeTE9IjEyNDAuMzEiIHgyPSIxMjk5LjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTMzMS42MSIgeTE9IjEyNDAuMzEiIHgyPSIxMzk2LjQxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTQyOC44MSIgeTE9IjEyNDAuMzEiIHgyPSIxNDkzLjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTUyNi4wMSIgeTE9IjEyNDAuMzEiIHgyPSIxNTkwLjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTYyMy4yMSIgeTE9IjEyNDAuMzEiIHgyPSIxNjg4LjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTcyMC40MSIgeTE9IjEyNDAuMzEiIHgyPSIxNzg1LjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTgxNy42MSIgeTE9IjEyNDAuMzEiIHgyPSIxODgyLjQxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTkxNC44MSIgeTE9IjEyNDAuMzEiIHgyPSIxOTc5LjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjAxMi4wMSIgeTE9IjEyNDAuMzEiIHgyPSIyMDc2LjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjEwOS4yMSIgeTE9IjEyNDAuMzEiIHgyPSIyMTc0LjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjIwNi40MSIgeTE9IjEyNDAuMzEiIHgyPSIyMjcxLjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjMwMy42MSIgeTE9IjEyNDAuMzEiIHgyPSIyMzY4LjQxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjQwMC44MSIgeTE9IjEyNDAuMzEiIHgyPSIyNDY1LjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjQ5OC4wMSIgeTE9IjEyNDAuMzEiIHgyPSIyNTYyLjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjU5NS4yMSIgeTE9IjEyNDAuMzEiIHgyPSIyNjYwLjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjY5Mi40MSIgeTE9IjEyNDAuMzEiIHgyPSIyNzU3LjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjc4OS42MSIgeTE9IjEyNDAuMzEiIHgyPSIyODU0LjQxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjg4Ni44MSIgeTE9IjEyNDAuMzEiIHgyPSIyOTUxLjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjk4NC4wMSIgeTE9IjEyNDAuMzEiIHgyPSIzMDQ4LjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzA4MS4yMSIgeTE9IjEyNDAuMzEiIHgyPSIzMTQ2LjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzE3OC40MSIgeTE9IjEyNDAuMzEiIHgyPSIzMjQzLjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzI3NS42MSIgeTE9IjEyNDAuMzEiIHgyPSIzMzQwLjQxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzM3Mi44MSIgeTE9IjEyNDAuMzEiIHgyPSIzNDM3LjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzQ3MC4wMSIgeTE9IjEyNDAuMzEiIHgyPSIzNTM0LjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzU2Ny4yMSIgeTE9IjEyNDAuMzEiIHgyPSIzNjMyLjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzY2NC40MSIgeTE9IjEyNDAuMzEiIHgyPSIzNzI5LjIxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzc2MS42MSIgeTE9IjEyNDAuMzEiIHgyPSIzODI2LjQxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzg1OC44MSIgeTE9IjEyNDAuMzEiIHgyPSIzOTIzLjYxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzk1Ni4wMSIgeTE9IjEyNDAuMzEiIHgyPSI0MDIwLjgxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iNDA1My4yMSIgeTE9IjEyNDAuMzEiIHgyPSI0MTE4LjAxIiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iNzQ4LjQxIiB5MT0iNTEyLjgzIiB4Mj0iODEzLjIxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4NDUuNjEiIHkxPSI1MTIuODMiIHgyPSI5MTAuNDEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9Ijk0Mi44MSIgeTE9IjUxMi44MyIgeDI9IjEwMDcuNjEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjEwNDAuMDEiIHkxPSI1MTIuODMiIHgyPSIxMTA0LjgxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxMTM3LjIxIiB5MT0iNTEyLjgzIiB4Mj0iMTIwMi4wMSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTIzNC40MSIgeTE9IjUxMi44MyIgeDI9IjEyOTkuMjEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjEzMzEuNjEiIHkxPSI1MTIuODMiIHgyPSIxMzk2LjQxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxNDI4LjgxIiB5MT0iNTEyLjgzIiB4Mj0iMTQ5My42MSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTUyNi4wMSIgeTE9IjUxMi44MyIgeDI9IjE1OTAuODEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE2MjMuMjEiIHkxPSI1MTIuODMiIHgyPSIxNjg4LjAxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxNzIwLjQxIiB5MT0iNTEyLjgzIiB4Mj0iMTc4NS4yMSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTgxNy42MSIgeTE9IjUxMi44MyIgeDI9IjE4ODIuNDEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE5MTQuODEiIHkxPSI1MTIuODMiIHgyPSIxOTc5LjYxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyMDEyLjAxIiB5MT0iNTEyLjgzIiB4Mj0iMjA3Ni44MSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjEwOS4yMSIgeTE9IjUxMi44MyIgeDI9IjIxNzQuMDEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjIyMDYuNDEiIHkxPSI1MTIuODMiIHgyPSIyMjcxLjIxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyMzAzLjYxIiB5MT0iNTEyLjgzIiB4Mj0iMjM2OC40MSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjQwMC44MSIgeTE9IjUxMi44MyIgeDI9IjI0NjUuNjEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI0OTguMDEiIHkxPSI1MTIuODMiIHgyPSIyNTYyLjgxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyNTk1LjIxIiB5MT0iNTEyLjgzIiB4Mj0iMjY2MC4wMSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjY5Mi40MSIgeTE9IjUxMi44MyIgeDI9IjI3NTcuMjEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI3ODkuNjEiIHkxPSI1MTIuODMiIHgyPSIyODU0LjQxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyODg2LjgxIiB5MT0iNTEyLjgzIiB4Mj0iMjk1MS42MSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjk4NC4wMSIgeTE9IjUxMi44MyIgeDI9IjMwNDguODEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjMwODEuMjEiIHkxPSI1MTIuODMiIHgyPSIzMTQ2LjAxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzMTc4LjQxIiB5MT0iNTEyLjgzIiB4Mj0iMzI0My4yMSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzI3NS42MSIgeTE9IjUxMi44MyIgeDI9IjMzNDAuNDEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjMzNzIuODEiIHkxPSI1MTIuODMiIHgyPSIzNDM3LjYxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzNDcwLjAxIiB5MT0iNTEyLjgzIiB4Mj0iMzUzNC44MSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzU2Ny4yMSIgeTE9IjUxMi44MyIgeDI9IjM2MzIuMDEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM2NjQuNDEiIHkxPSI1MTIuODMiIHgyPSIzNzI5LjIxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzNzYxLjYxIiB5MT0iNTEyLjgzIiB4Mj0iMzgyNi40MSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzg1OC44MSIgeTE9IjUxMi44MyIgeDI9IjM5MjMuNjEiIHkyPSI1MTIuODMiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM5NTYuMDEiIHkxPSI1MTIuODMiIHgyPSI0MDIwLjgxIiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI0MDUzLjIxIiB5MT0iNTEyLjgzIiB4Mj0iNDExOC4wMSIgeTI9IjUxMi44MyIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMjc2Ni42NiIgeDI9IjgxOS42MiIgeTI9IjI3MDEuODYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjI2NjkuNDYiIHgyPSI4MTkuNjIiIHkyPSIyNjA0LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIyNTcyLjI2IiB4Mj0iODE5LjYyIiB5Mj0iMjUwNy40NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMjQ3NS4wNiIgeDI9IjgxOS42MiIgeTI9IjI0MTAuMjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjIzNzcuODYiIHgyPSI4MTkuNjIiIHkyPSIyMzEzLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIyMjgwLjY2IiB4Mj0iODE5LjYyIiB5Mj0iMjIxNS44NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMjE4My40NiIgeDI9IjgxOS42MiIgeTI9IjIxMTguNjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjIwODYuMjYiIHgyPSI4MTkuNjIiIHkyPSIyMDIxLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIxOTg5LjA2IiB4Mj0iODE5LjYyIiB5Mj0iMTkyNC4yNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMTg5MS44NiIgeDI9IjgxOS42MiIgeTI9IjE4MjcuMDYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjE3OTQuNjYiIHgyPSI4MTkuNjIiIHkyPSIxNzI5Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIxNjk3LjQ2IiB4Mj0iODE5LjYyIiB5Mj0iMTYzMi42NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMTYwMC4yNiIgeDI9IjgxOS42MiIgeTI9IjE1MzUuNDYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjE1MDMuMDYiIHgyPSI4MTkuNjIiIHkyPSIxNDM4LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIxNDA1Ljg2IiB4Mj0iODE5LjYyIiB5Mj0iMTM0MS4wNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMTMwOC42NiIgeDI9IjgxOS42MiIgeTI9IjEyNDMuODYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjEyMTEuNDYiIHgyPSI4MTkuNjIiIHkyPSIxMTQ2LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIxMTE0LjI2IiB4Mj0iODE5LjYyIiB5Mj0iMTA0OS40NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMTAxNy4wNiIgeDI9IjgxOS42MiIgeTI9Ijk1Mi4yNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iOTE5Ljg2IiB4Mj0iODE5LjYyIiB5Mj0iODU1LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSI4MjIuNjYiIHgyPSI4MTkuNjIiIHkyPSI3NTcuODYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjcyNS40NiIgeDI9IjgxOS42MiIgeTI9IjY2MC42NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iNjI4LjI2IiB4Mj0iODE5LjYyIiB5Mj0iNTYzLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSI1MzEuMDYiIHgyPSI4MTkuNjIiIHkyPSI0NjYuMjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjgxOS42MiIgeTE9IjQzMy44NiIgeDI9IjgxOS42MiIgeTI9IjM2OS4wNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iODE5LjYyIiB5MT0iMzM2LjY2IiB4Mj0iODE5LjYyIiB5Mj0iMzA5LjgyIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjc2Ni42NiIgeDI9IjE4NjMuMTciIHkyPSIyNzAxLjg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjY2OS40NiIgeDI9IjE4NjMuMTciIHkyPSIyNjA0LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjU3Mi4yNiIgeDI9IjE4NjMuMTciIHkyPSIyNTA3LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjQ3NS4wNiIgeDI9IjE4NjMuMTciIHkyPSIyNDEwLjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjM3Ny44NiIgeDI9IjE4NjMuMTciIHkyPSIyMzEzLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjI4MC42NiIgeDI9IjE4NjMuMTciIHkyPSIyMjE1Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjE4My40NiIgeDI9IjE4NjMuMTciIHkyPSIyMTE4LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjA4Ni4yNiIgeDI9IjE4NjMuMTciIHkyPSIyMDIxLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTk4OS4wNiIgeDI9IjE4NjMuMTciIHkyPSIxOTI0LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTg5MS44NiIgeDI9IjE4NjMuMTciIHkyPSIxODI3LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTc5NC42NiIgeDI9IjE4NjMuMTciIHkyPSIxNzI5Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTY5Ny40NiIgeDI9IjE4NjMuMTciIHkyPSIxNjMyLjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTYwMC4yNiIgeDI9IjE4NjMuMTciIHkyPSIxNTM1LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTUwMy4wNiIgeDI9IjE4NjMuMTciIHkyPSIxNDM4LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTQwNS44NiIgeDI9IjE4NjMuMTciIHkyPSIxMzQxLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTMwOC42NiIgeDI9IjE4NjMuMTciIHkyPSIxMjQzLjg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTIxMS40NiIgeDI9IjE4NjMuMTciIHkyPSIxMTQ2LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTExNC4yNiIgeDI9IjE4NjMuMTciIHkyPSIxMDQ5LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMTAxNy4wNiIgeDI9IjE4NjMuMTciIHkyPSI5NTIuMjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE4NjMuMTciIHkxPSI5MTkuODYiIHgyPSIxODYzLjE3IiB5Mj0iODU1LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iODIyLjY2IiB4Mj0iMTg2My4xNyIgeTI9Ijc1Ny44NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTg2My4xNyIgeTE9IjcyNS40NiIgeDI9IjE4NjMuMTciIHkyPSI2NjAuNjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE4NjMuMTciIHkxPSI2MjguMjYiIHgyPSIxODYzLjE3IiB5Mj0iNTYzLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iNTMxLjA2IiB4Mj0iMTg2My4xNyIgeTI9IjQ2Ni4yNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMTg2My4xNyIgeTE9IjQzMy44NiIgeDI9IjE4NjMuMTciIHkyPSIzNjkuMDYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjE4NjMuMTciIHkxPSIzMzYuNjYiIHgyPSIxODYzLjE3IiB5Mj0iMzA5LjgyIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjc2Ni42NiIgeDI9IjI5MDYuNzIiIHkyPSIyNzAxLjg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjY2OS40NiIgeDI9IjI5MDYuNzIiIHkyPSIyNjA0LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjU3Mi4yNiIgeDI9IjI5MDYuNzIiIHkyPSIyNTA3LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjQ3NS4wNiIgeDI9IjI5MDYuNzIiIHkyPSIyNDEwLjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjM3Ny44NiIgeDI9IjI5MDYuNzIiIHkyPSIyMzEzLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjI4MC42NiIgeDI9IjI5MDYuNzIiIHkyPSIyMjE1Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjE4My40NiIgeDI9IjI5MDYuNzIiIHkyPSIyMTE4LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjA4Ni4yNiIgeDI9IjI5MDYuNzIiIHkyPSIyMDIxLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTk4OS4wNiIgeDI9IjI5MDYuNzIiIHkyPSIxOTI0LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTg5MS44NiIgeDI9IjI5MDYuNzIiIHkyPSIxODI3LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTc5NC42NiIgeDI9IjI5MDYuNzIiIHkyPSIxNzI5Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTY5Ny40NiIgeDI9IjI5MDYuNzIiIHkyPSIxNjMyLjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTYwMC4yNiIgeDI9IjI5MDYuNzIiIHkyPSIxNTM1LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTUwMy4wNiIgeDI9IjI5MDYuNzIiIHkyPSIxNDM4LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTQwNS44NiIgeDI9IjI5MDYuNzIiIHkyPSIxMzQxLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTMwOC42NiIgeDI9IjI5MDYuNzIiIHkyPSIxMjQzLjg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTIxMS40NiIgeDI9IjI5MDYuNzIiIHkyPSIxMTQ2LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTExNC4yNiIgeDI9IjI5MDYuNzIiIHkyPSIxMDQ5LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMTAxNy4wNiIgeDI9IjI5MDYuNzIiIHkyPSI5NTIuMjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI5MDYuNzIiIHkxPSI5MTkuODYiIHgyPSIyOTA2LjcyIiB5Mj0iODU1LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iODIyLjY2IiB4Mj0iMjkwNi43MiIgeTI9Ijc1Ny44NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjkwNi43MiIgeTE9IjcyNS40NiIgeDI9IjI5MDYuNzIiIHkyPSI2NjAuNjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI5MDYuNzIiIHkxPSI2MjguMjYiIHgyPSIyOTA2LjcyIiB5Mj0iNTYzLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iNTMxLjA2IiB4Mj0iMjkwNi43MiIgeTI9IjQ2Ni4yNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMjkwNi43MiIgeTE9IjQzMy44NiIgeDI9IjI5MDYuNzIiIHkyPSIzNjkuMDYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjI5MDYuNzIiIHkxPSIzMzYuNjYiIHgyPSIyOTA2LjcyIiB5Mj0iMzA5LjgyIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjc2Ni42NiIgeDI9IjM5NTAuMTAiIHkyPSIyNzAxLjg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjY2OS40NiIgeDI9IjM5NTAuMTAiIHkyPSIyNjA0LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjU3Mi4yNiIgeDI9IjM5NTAuMTAiIHkyPSIyNTA3LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjQ3NS4wNiIgeDI9IjM5NTAuMTAiIHkyPSIyNDEwLjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjM3Ny44NiIgeDI9IjM5NTAuMTAiIHkyPSIyMzEzLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjI4MC42NiIgeDI9IjM5NTAuMTAiIHkyPSIyMjE1Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjE4My40NiIgeDI9IjM5NTAuMTAiIHkyPSIyMTE4LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjA4Ni4yNiIgeDI9IjM5NTAuMTAiIHkyPSIyMDIxLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTk4OS4wNiIgeDI9IjM5NTAuMTAiIHkyPSIxOTI0LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTg5MS44NiIgeDI9IjM5NTAuMTAiIHkyPSIxODI3LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTc5NC42NiIgeDI9IjM5NTAuMTAiIHkyPSIxNzI5Ljg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTY5Ny40NiIgeDI9IjM5NTAuMTAiIHkyPSIxNjMyLjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTYwMC4yNiIgeDI9IjM5NTAuMTAiIHkyPSIxNTM1LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTUwMy4wNiIgeDI9IjM5NTAuMTAiIHkyPSIxNDM4LjI2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTQwNS44NiIgeDI9IjM5NTAuMTAiIHkyPSIxMzQxLjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTMwOC42NiIgeDI9IjM5NTAuMTAiIHkyPSIxMjQzLjg2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTIxMS40NiIgeDI9IjM5NTAuMTAiIHkyPSIxMTQ2LjY2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTExNC4yNiIgeDI9IjM5NTAuMTAiIHkyPSIxMDQ5LjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMTAxNy4wNiIgeDI9IjM5NTAuMTAiIHkyPSI5NTIuMjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM5NTAuMTAiIHkxPSI5MTkuODYiIHgyPSIzOTUwLjEwIiB5Mj0iODU1LjA2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iODIyLjY2IiB4Mj0iMzk1MC4xMCIgeTI9Ijc1Ny44NiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzk1MC4xMCIgeTE9IjcyNS40NiIgeDI9IjM5NTAuMTAiIHkyPSI2NjAuNjYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM5NTAuMTAiIHkxPSI2MjguMjYiIHgyPSIzOTUwLjEwIiB5Mj0iNTYzLjQ2IiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iNTMxLjA2IiB4Mj0iMzk1MC4xMCIgeTI9IjQ2Ni4yNiIgc3R5bGU9InN0cm9rZTojRjBGMEYwO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iMzk1MC4xMCIgeTE9IjQzMy44NiIgeDI9IjM5NTAuMTAiIHkyPSIzNjkuMDYiIHN0eWxlPSJzdHJva2U6I0YwRjBGMDtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGxpbmUgeDE9IjM5NTAuMTAiIHkxPSIzMzYuNjYiIHgyPSIzOTUwLjEwIiB5Mj0iMzA5LjgyIiBzdHlsZT0ic3Ryb2tlOiNGMEYwRjA7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIwNzEuNzQiIGN5PSIyMDk5LjA4IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjA3MS43NCIgY3k9IjIwOTkuMDgiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNTQ5Ljk3IiBjeT0iMjAwNC40MSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE1NDkuOTciIGN5PSIyMDA0LjQxIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTg2My4wMCIgY3k9IjE5OTQuNjMiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxODYzLjAwIiBjeT0iMTk5NC42MyIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjEzNDEuMjMiIGN5PSIxNTU2LjU1IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTM0MS4yMyIgY3k9IjE1NTYuNTUiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNjU0LjQzIiBjeT0iMTg1My4yMSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE2NTQuNDMiIGN5PSIxODUzLjIxIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTg2My4wMCIgY3k9IjE5NDAuNDYiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxODYzLjAwIiBjeT0iMTk0MC40NiIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE0NDUuNjgiIGN5PSIxMTg2LjMxIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTQ0NS42OCIgY3k9IjExODYuMzEiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNzU4LjcxIiBjeT0iMjEwMS40NCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE3NTguNzEiIGN5PSIyMTAxLjQ0IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTIzNi45NCIgY3k9IjEwMzguOTkiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxMjM2Ljk0IiBjeT0iMTAzOC45OSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjEyMzYuOTQiIGN5PSI1ODUuNzMiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxMjM2Ljk0IiBjeT0iNTg1LjczIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTk2Ny40NiIgY3k9IjM4MS4yMSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE5NjcuNDYiIGN5PSIzODEuMjEiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyODAyLjI2IiBjeT0iMjIxNS4zNSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjI4MDIuMjYiIGN5PSIyMjE1LjM1IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTQ0NS42OCIgY3k9IjE4NjUuMzYiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNDQ1LjY4IiBjeT0iMTg2NS4zNiIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIwNzEuNzQiIGN5PSIyMDQwLjAyIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjA3MS43NCIgY3k9IjIwNDAuMDIiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyMDcxLjc0IiBjeT0iMTk1Mi43OCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjIwNzEuNzQiIGN5PSIxOTUyLjc4IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjI4MC40OSIgY3k9IjIxNjEuODYiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyMjgwLjQ5IiBjeT0iMjE2MS44NiIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE3NTguNzEiIGN5PSIyMTIwLjAxIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTc1OC43MSIgY3k9IjIxMjAuMDEiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyOTA2LjU1IiBjeT0iMjExNS43OSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjI5MDYuNTUiIGN5PSIyMTE1Ljc5IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTY1NC40MyIgY3k9IjIxMTEuOTEiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNjU0LjQzIiBjeT0iMjExMS45MSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE0NDUuNjgiIGN5PSIxODM5LjA0IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTQ0NS42OCIgY3k9IjE4MzkuMDQiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNTQ5Ljk3IiBjeT0iMTc3Mi43MiIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE1NDkuOTciIGN5PSIxNzcyLjcyIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjY5Ny44MSIgY3k9IjIwNTYuODkiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyNjk3LjgxIiBjeT0iMjA1Ni44OSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE5NjcuNDYiIGN5PSIyMDg2LjI2IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTk2Ny40NiIgY3k9IjIwODYuMjYiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxMDI4LjE5IiBjeT0iMTAyMi42MyIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjEwMjguMTkiIGN5PSIxMDIyLjYzIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTAyOC4xOSIgY3k9IjcxNy41MyIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjEwMjguMTkiIGN5PSI3MTcuNTMiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxMjM2Ljk0IiBjeT0iNzM2LjA5IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTIzNi45NCIgY3k9IjczNi4wOSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIwNzEuNzQiIGN5PSIyMTM4LjIzIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjA3MS43NCIgY3k9IjIxMzguMjMiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxMjM2Ljk0IiBjeT0iMTkxMi43OCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjEyMzYuOTQiIGN5PSIxOTEyLjc4IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTM0MS4yMyIgY3k9IjE3OTguMzciIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxMzQxLjIzIiBjeT0iMTc5OC4zNyIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE2NTQuNDMiIGN5PSIyMDM4LjMzIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTY1NC40MyIgY3k9IjIwMzguMzMiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxMjM2Ljk0IiBjeT0iMTc3OC4yOSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjEyMzYuOTQiIGN5PSIxNzc4LjI5IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTg2My4wMCIgY3k9IjIyMTYuNTMiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxODYzLjAwIiBjeT0iMjIxNi41MyIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE5NjcuNDYiIGN5PSIxNDEyLjk0IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTk2Ny40NiIgY3k9IjE0MTIuOTQiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNzU4LjcxIiBjeT0iMTk0Mi45OSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE3NTguNzEiIGN5PSIxOTQyLjk5IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTc1OC43MSIgY3k9IjIwMDYuNzgiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNzU4LjcxIiBjeT0iMjAwNi43OCIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE2NTQuNDMiIGN5PSIxOTgzLjk5IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTY1NC40MyIgY3k9IjE5ODMuOTkiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNzU4LjcxIiBjeT0iMjA4Ny4xMCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE3NTguNzEiIGN5PSIyMDg3LjEwIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjI4MC40OSIgY3k9IjIwODUuMDciIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyMjgwLjQ5IiBjeT0iMjA4NS4wNyIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE0NDUuNjgiIGN5PSIxMTg2LjQ4IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTQ0NS42OCIgY3k9IjExODYuNDgiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyNjk3LjgxIiBjeT0iMjAxOS4yNiIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjI2OTcuODEiIGN5PSIyMDE5LjI2IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMzMyNC4wNCIgY3k9IjIwNTEuNjYiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIzMzI0LjA0IiBjeT0iMjA1MS42NiIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIzODQuNzgiIGN5PSIyMDQzLjIzIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjM4NC43OCIgY3k9IjIwNDMuMjMiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNjU0LjQzIiBjeT0iMjEwNC42NSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE2NTQuNDMiIGN5PSIyMTA0LjY1IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTY1NC40MyIgY3k9IjE4NTEuODYiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNjU0LjQzIiBjeT0iMTg1MS44NiIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE2NTQuNDMiIGN5PSIxOTc3LjU4IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMTY1NC40MyIgY3k9IjE5NzcuNTgiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNzU4LjcxIiBjeT0iMTkzNS41NiIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE3NTguNzEiIGN5PSIxOTM1LjU2IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTc1OC43MSIgY3k9IjIwMDguMjkiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNzU4LjcxIiBjeT0iMjAwOC4yOSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIyODAuNDkiIGN5PSIyMDg4LjQ1IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjI4MC40OSIgY3k9IjIwODguNDUiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNTQ5Ljk3IiBjeT0iMTI4NS41NCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE1NDkuOTciIGN5PSIxMjg1LjU0IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjE3Ni4wMyIgY3k9IjE3NzkuNDciIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyMTc2LjAzIiBjeT0iMTc3OS40NyIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIzODQuNzgiIGN5PSIxMjc4Ljk2IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjM4NC43OCIgY3k9IjEyNzguOTYiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyMTc2LjAzIiBjeT0iMTc4OS4wOSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjIxNzYuMDMiIGN5PSIxNzg5LjA5IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMzQyOC4zMyIgY3k9IjIwMjcuNzAiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIzNDI4LjMzIiBjeT0iMjAyNy43MCIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIyODAuNDkiIGN5PSIxOTU2LjQ5IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjI4MC40OSIgY3k9IjE5NTYuNDkiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxOTY3LjQ2IiBjeT0iMTUxMi42OCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE5NjcuNDYiIGN5PSIxNTEyLjY4IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTk2Ny40NiIgY3k9IjIwNzAuMzkiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxOTY3LjQ2IiBjeT0iMjA3MC4zOSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjIzODQuNzgiIGN5PSIxODUxLjY5IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjM4NC43OCIgY3k9IjE4NTEuNjkiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyNjk3LjgxIiBjeT0iMjA0MC44NiIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjI2OTcuODEiIGN5PSIyMDQwLjg2IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjkwNi41NSIgY3k9IjIxMTQuMTAiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyOTA2LjU1IiBjeT0iMjExNC4xMCIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjI0ODkuMjMiIGN5PSIyMTI4Ljc4IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMjQ4OS4yMyIgY3k9IjIxMjguNzgiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIzNDI4LjMzIiBjeT0iMjE0Mi43OSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjM0MjguMzMiIGN5PSIyMTQyLjc5IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMTY1NC40MyIgY3k9IjE4MzcuMTgiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNjU0LjQzIiBjeT0iMTgzNy4xOCIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjMwMTEuMDEiIGN5PSIyMTUwLjA0IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iMzAxMS4wMSIgY3k9IjIxNTAuMDQiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIxNjU0LjQzIiBjeT0iMTg2My4zNCIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjE2NTQuNDMiIGN5PSIxODYzLjM0IiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjE3Ni4wMyIgY3k9IjE2NTYuNjIiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyMTc2LjAzIiBjeT0iMTY1Ni42MiIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjQwNTQuMzkiIGN5PSIxOTEwLjI1IiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iNDA1NC4zOSIgY3k9IjE5MTAuMjUiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8Y2lyY2xlIGN4PSIyMzg0Ljc4IiBjeT0iMjAxMi4wMSIgcj0iMjEuNzQiIHN0eWxlPSJmaWxsOiMxQTg1RkYiLz4KCTxjaXJjbGUgY3g9IjIzODQuNzgiIGN5PSIyMDEyLjAxIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPGNpcmNsZSBjeD0iMjM4NC43OCIgY3k9IjE2OTguODEiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIyMzg0Ljc4IiBjeT0iMTY5OC44MSIgcj0iMTYuODgiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMxQTg1RkY7c3Ryb2tlLXdpZHRoOjkuNzIiLz4KCTxjaXJjbGUgY3g9IjE1NDkuOTciIGN5PSI5NTAuMjMiIHI9IjIxLjc0IiBzdHlsZT0iZmlsbDojMUE4NUZGIi8+Cgk8Y2lyY2xlIGN4PSIxNTQ5Ljk3IiBjeT0iOTUwLjIzIiByPSIxNi44OCIgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzFBODVGRjtzdHJva2Utd2lkdGg6OS43MiIvPgoJPHBhdGggZD0iIE0xMDI4LjE5IDE0OTUuMjkgTDI1NDEuMzggMTk3Mi44NiBMNDA1NC4zOSAyNDUwLjI1IiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojRDQxMTU5O3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iNzQ4LjQxIiB5MT0iMjc2Ni42NiIgeDI9Ijc0OC40MSIgeTI9IjMwOS44MiIgc3R5bGU9InN0cm9rZTojMDAwMDAwO3N0cm9rZS13aWR0aDo2LjQ4Ii8+Cgk8bGluZSB4MT0iNzQ4LjQxIiB5MT0iMjY5NS4yOCIgeDI9IjcwMy4zNSIgeTI9IjI2OTUuMjgiIHN0eWxlPSJzdHJva2U6IzAwMDAwMDtzdHJva2Utd2lkdGg6Ni40OCIvPgoJPHRleHQgeD0iNjgwLjkxIiB5PSIyNzM0LjcxIiBzdHlsZT0iZm9udC1mYW1pbHk6J0hlbHZldGljYSc7Zm9udC1zaXplOjExMi41NnB4O2ZpbGw6IzAwMDAwMCIgdGV4dC1hbmNob3I9ImVuZCI+MDwvdGV4dD4KCTxsaW5lIHgxPSI3NDguNDEiIHkxPSIxOTY3Ljc5IiB4Mj0iNzAzLjM1IiB5Mj0iMTk2Ny43OSIgc3R5bGU9InN0cm9rZTojMDAwMDAwO3N0cm9rZS13aWR0aDo2LjQ4Ii8+Cgk8dGV4dCB4PSI2ODAuOTEiIHk9IjIwMDcuMjMiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0iZW5kIj41LDAwMDwvdGV4dD4KCTxsaW5lIHgxPSI3NDguNDEiIHkxPSIxMjQwLjMxIiB4Mj0iNzAzLjM1IiB5Mj0iMTI0MC4zMSIgc3R5bGU9InN0cm9rZTojMDAwMDAwO3N0cm9rZS13aWR0aDo2LjQ4Ii8+Cgk8dGV4dCB4PSI2ODAuOTEiIHk9IjEyNzkuNzUiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0iZW5kIj4xMCwwMDA8L3RleHQ+Cgk8bGluZSB4MT0iNzQ4LjQxIiB5MT0iNTEyLjgzIiB4Mj0iNzAzLjM1IiB5Mj0iNTEyLjgzIiBzdHlsZT0ic3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLXdpZHRoOjYuNDgiLz4KCTx0ZXh0IHg9IjY4MC45MSIgeT0iNTUyLjI3IiBzdHlsZT0iZm9udC1mYW1pbHk6J0hlbHZldGljYSc7Zm9udC1zaXplOjExMi41NnB4O2ZpbGw6IzAwMDAwMCIgdGV4dC1hbmNob3I9ImVuZCI+MTUsMDAwPC90ZXh0PgoJPHRleHQgeD0iMjE0LjU1IiB5PSIxNTM4LjE2IiBzdHlsZT0iZm9udC1mYW1pbHk6J0hlbHZldGljYSc7Zm9udC1zaXplOjExMi41NnB4O2ZpbGw6IzAwMDAwMCIgdHJhbnNmb3JtPSJyb3RhdGUoLTkwIDIxNC41NSwxNTM4LjE2KSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UHJpY2UgKFVTRCk8L3RleHQ+Cgk8bGluZSB4MT0iNzQ4LjQxIiB5MT0iMjc2Ni42NiIgeDI9IjQxMjUuNzciIHkyPSIyNzY2LjY2IiBzdHlsZT0ic3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLXdpZHRoOjYuNDgiLz4KCTxsaW5lIHgxPSI4MTkuNjIiIHkxPSIyNzY2LjY2IiB4Mj0iODE5LjYyIiB5Mj0iMjgxMS41NCIgc3R5bGU9InN0cm9rZTojMDAwMDAwO3N0cm9rZS13aWR0aDo2LjQ4Ii8+Cgk8dGV4dCB4PSI4MTkuNjIiIHk9IjI5MTIuODYiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4xMDwvdGV4dD4KCTxsaW5lIHgxPSIxODYzLjE3IiB5MT0iMjc2Ni42NiIgeDI9IjE4NjMuMTciIHkyPSIyODExLjU0IiBzdHlsZT0ic3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLXdpZHRoOjYuNDgiLz4KCTx0ZXh0IHg9IjE4NjMuMTciIHk9IjI5MTIuODYiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4yMDwvdGV4dD4KCTxsaW5lIHgxPSIyOTA2LjcyIiB5MT0iMjc2Ni42NiIgeDI9IjI5MDYuNzIiIHkyPSIyODExLjU0IiBzdHlsZT0ic3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLXdpZHRoOjYuNDgiLz4KCTx0ZXh0IHg9IjI5MDYuNzIiIHk9IjI5MTIuODYiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4zMDwvdGV4dD4KCTxsaW5lIHgxPSIzOTUwLjEwIiB5MT0iMjc2Ni42NiIgeDI9IjM5NTAuMTAiIHkyPSIyODExLjU0IiBzdHlsZT0ic3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLXdpZHRoOjYuNDgiLz4KCTx0ZXh0IHg9IjM5NTAuMTAiIHk9IjI5MTIuODYiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj40MDwvdGV4dD4KCTx0ZXh0IHg9IjI0MzcuMDkiIHk9IjMwNzAuMzEiIHN0eWxlPSJmb250LWZhbWlseTonSGVsdmV0aWNhJztmb250LXNpemU6MTEyLjU2cHg7ZmlsbDojMDAwMDAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5NaWxlcyBwZXIgR2FsbG9uPC90ZXh0PgoJPHJlY3QgeD0iNDE2NC43NSIgeT0iMTM1NC41NiIgd2lkdGg9IjEwODMuMDQiIGhlaWdodD0iMzY3LjIwIiBzdHlsZT0iZmlsbDojRkZGRkZGIi8+Cgk8cmVjdCB4PSI0MTY3Ljk5IiB5PSIxMzU3LjgwIiB3aWR0aD0iMTA3Ni41NiIgaGVpZ2h0PSIzNjAuNzIiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiNGRkZGRkY7c3Ryb2tlLXdpZHRoOjYuNDgiLz4KCTxjaXJjbGUgY3g9IjQzNDIuOTUiIGN5PSIxNDU5LjUyIiByPSIyMS43NCIgc3R5bGU9ImZpbGw6IzFBODVGRiIvPgoJPGNpcmNsZSBjeD0iNDM0Mi45NSIgY3k9IjE0NTkuNTIiIHI9IjE2Ljg4IiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMUE4NUZGO3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8bGluZSB4MT0iNDIxMy4zNSIgeTE9IjE2MTYuOTYiIHgyPSI0NDcyLjU1IiB5Mj0iMTYxNi45NiIgc3R5bGU9InN0cm9rZTojRDQxMTU5O3N0cm9rZS13aWR0aDo5LjcyIi8+Cgk8dGV4dCB4PSI0NTQwLjA1IiB5PSIxNDk4Ljk2IiBzdHlsZT0iZm9udC1mYW1pbHk6J0hlbHZldGljYSc7Zm9udC1zaXplOjExMi41NnB4O2ZpbGw6IzAwMDAwMCI+UHJpY2U8L3RleHQ+Cgk8dGV4dCB4PSI0NTQwLjA1IiB5PSIxNjU2LjQwIiBzdHlsZT0iZm9udC1mYW1pbHk6J0hlbHZldGljYSc7Zm9udC1zaXplOjExMi41NnB4O2ZpbGw6IzAwMDAwMCI+Rml0dGVkIHZhbHVlczwvdGV4dD4KCTx0ZXh0IHg9IjI0MzcuMDkiIHk9IjI0My4xMCIgc3R5bGU9ImZvbnQtZmFtaWx5OidIZWx2ZXRpY2EnO2ZvbnQtc2l6ZToxNTcuNDRweDtmaWxsOiMwMDAwMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByaWNlIHZzIE1QRzwvdGV4dD4KPC9zdmc+Cg==)

*Worked for 1.3s*
