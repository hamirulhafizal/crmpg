@page.tsx (1741-1891) 

I Would like to create an automation features where , it will automatically register new customer via virtual browser based on the form given 

here is the link , intro_pgcode=PG00104897 -- this will take from dealer rotation turn 

https://publicgold.com.my/index.php?route=account/register&intro_pgcode=PG00104897&is_dealer=1 @/Users/hamirulhafizal/Desktop/Customer Registration.html 

<html class="fontawesome-i2svg-active fontawesome-i2svg-complete"><head>
        <title>Customer Registration</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <base href="https://publicgold.com.my/">
        <script type="text/javascript" async="" charset="utf-8" src="https://static.revechat.com/widget/scripts/new-livechat.js?1778005505812"></script><script src="catalog/view/javascript/jquery/jquery-2.1.1.min.js" type="text/javascript"></script>

                <style type="text/css">svg:not(:root).svg-inline--fa{overflow:visible}.svg-inline--fa{display:inline-block;font-size:inherit;height:1em;overflow:visible;vertical-align:-.125em}.svg-inline--fa.fa-lg{vertical-align:-.225em}.svg-inline--fa.fa-w-1{width:.0625em}.svg-inline--fa.fa-w-2{width:.125em}.svg-inline--fa.fa-w-3{width:.1875em}.svg-inline--fa.fa-w-4{width:.25em}.svg-inline--fa.fa-w-5{width:.3125em}.svg-inline--fa.fa-w-6{width:.375em}.svg-inline--fa.fa-w-7{width:.4375em}.svg-inline--fa.fa-w-8{width:.5em}.svg-inline--fa.fa-w-9{width:.5625em}.svg-inline--fa.fa-w-10{width:.625em}.svg-inline--fa.fa-w-11{width:.6875em}.svg-inline--fa.fa-w-12{width:.75em}.svg-inline--fa.fa-w-13{width:.8125em}.svg-inline--fa.fa-w-14{width:.875em}.svg-inline--fa.fa-w-15{width:.9375em}.svg-inline--fa.fa-w-16{width:1em}.svg-inline--fa.fa-w-17{width:1.0625em}.svg-inline--fa.fa-w-18{width:1.125em}.svg-inline--fa.fa-w-19{width:1.1875em}.svg-inline--fa.fa-w-20{width:1.25em}.svg-inline--fa.fa-pull-left{margin-right:.3em;width:auto}.svg-inline--fa.fa-pull-right{margin-left:.3em;width:auto}.svg-inline--fa.fa-border{height:1.5em}.svg-inline--fa.fa-li{width:2em}.svg-inline--fa.fa-fw{width:1.25em}.fa-layers svg.svg-inline--fa{bottom:0;left:0;margin:auto;position:absolute;right:0;top:0}.fa-layers{display:inline-block;height:1em;position:relative;text-align:center;vertical-align:-.125em;width:1em}.fa-layers svg.svg-inline--fa{-webkit-transform-origin:center center;transform-origin:center center}.fa-layers-counter,.fa-layers-text{display:inline-block;position:absolute;text-align:center}.fa-layers-text{left:50%;top:50%;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);-webkit-transform-origin:center center;transform-origin:center center}.fa-layers-counter{background-color:#ff253a;border-radius:1em;-webkit-box-sizing:border-box;box-sizing:border-box;color:#fff;height:1.5em;line-height:1;max-width:5em;min-width:1.5em;overflow:hidden;padding:.25em;right:0;text-overflow:ellipsis;top:0;-webkit-transform:scale(.25);transform:scale(.25);-webkit-transform-origin:top right;transform-origin:top right}.fa-layers-bottom-right{bottom:0;right:0;top:auto;-webkit-transform:scale(.25);transform:scale(.25);-webkit-transform-origin:bottom right;transform-origin:bottom right}.fa-layers-bottom-left{bottom:0;left:0;right:auto;top:auto;-webkit-transform:scale(.25);transform:scale(.25);-webkit-transform-origin:bottom left;transform-origin:bottom left}.fa-layers-top-right{right:0;top:0;-webkit-transform:scale(.25);transform:scale(.25);-webkit-transform-origin:top right;transform-origin:top right}.fa-layers-top-left{left:0;right:auto;top:0;-webkit-transform:scale(.25);transform:scale(.25);-webkit-transform-origin:top left;transform-origin:top left}.fa-lg{font-size:1.3333333333em;line-height:.75em;vertical-align:-.0667em}.fa-xs{font-size:.75em}.fa-sm{font-size:.875em}.fa-1x{font-size:1em}.fa-2x{font-size:2em}.fa-3x{font-size:3em}.fa-4x{font-size:4em}.fa-5x{font-size:5em}.fa-6x{font-size:6em}.fa-7x{font-size:7em}.fa-8x{font-size:8em}.fa-9x{font-size:9em}.fa-10x{font-size:10em}.fa-fw{text-align:center;width:1.25em}.fa-ul{list-style-type:none;margin-left:2.5em;padding-left:0}.fa-ul>li{position:relative}.fa-li{left:-2em;position:absolute;text-align:center;width:2em;line-height:inherit}.fa-border{border:solid .08em #eee;border-radius:.1em;padding:.2em .25em .15em}.fa-pull-left{float:left}.fa-pull-right{float:right}.fa.fa-pull-left,.fab.fa-pull-left,.fal.fa-pull-left,.far.fa-pull-left,.fas.fa-pull-left{margin-right:.3em}.fa.fa-pull-right,.fab.fa-pull-right,.fal.fa-pull-right,.far.fa-pull-right,.fas.fa-pull-right{margin-left:.3em}.fa-spin{-webkit-animation:fa-spin 2s infinite linear;animation:fa-spin 2s infinite linear}.fa-pulse{-webkit-animation:fa-spin 1s infinite steps(8);animation:fa-spin 1s infinite steps(8)}@-webkit-keyframes fa-spin{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}@keyframes fa-spin{0%{-webkit-transform:rotate(0);transform:rotate(0)}100%{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}.fa-rotate-90{-webkit-transform:rotate(90deg);transform:rotate(90deg)}.fa-rotate-180{-webkit-transform:rotate(180deg);transform:rotate(180deg)}.fa-rotate-270{-webkit-transform:rotate(270deg);transform:rotate(270deg)}.fa-flip-horizontal{-webkit-transform:scale(-1,1);transform:scale(-1,1)}.fa-flip-vertical{-webkit-transform:scale(1,-1);transform:scale(1,-1)}.fa-flip-both,.fa-flip-horizontal.fa-flip-vertical{-webkit-transform:scale(-1,-1);transform:scale(-1,-1)}:root .fa-flip-both,:root .fa-flip-horizontal,:root .fa-flip-vertical,:root .fa-rotate-180,:root .fa-rotate-270,:root .fa-rotate-90{-webkit-filter:none;filter:none}.fa-stack{display:inline-block;height:2em;position:relative;width:2.5em}.fa-stack-1x,.fa-stack-2x{bottom:0;left:0;margin:auto;position:absolute;right:0;top:0}.svg-inline--fa.fa-stack-1x{height:1em;width:1.25em}.svg-inline--fa.fa-stack-2x{height:2em;width:2.5em}.fa-inverse{color:#fff}.sr-only{border:0;clip:rect(0,0,0,0);height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;width:1px}.sr-only-focusable:active,.sr-only-focusable:focus{clip:auto;height:auto;margin:0;overflow:visible;position:static;width:auto}.svg-inline--fa .fa-primary{fill:var(--fa-primary-color,currentColor);opacity:1;opacity:var(--fa-primary-opacity,1)}.svg-inline--fa .fa-secondary{fill:var(--fa-secondary-color,currentColor);opacity:.4;opacity:var(--fa-secondary-opacity,.4)}.svg-inline--fa.fa-swap-opacity .fa-primary{opacity:.4;opacity:var(--fa-secondary-opacity,.4)}.svg-inline--fa.fa-swap-opacity .fa-secondary{opacity:1;opacity:var(--fa-primary-opacity,1)}.svg-inline--fa mask .fa-primary,.svg-inline--fa mask .fa-secondary{fill:#000}.fad.fa-inverse{color:#fff}</style><link href="catalog/view/theme/default/stylesheet/legacy_ef/css4/bootstrap.min.css" rel="stylesheet" type="text/css" media="screen">
                <link href="catalog/view/theme/default/stylesheet/legacy_ef/css4/jquery-ui.css" rel="stylesheet" type="text/css" media="screen">
                <link href="catalog/view/theme/default/stylesheet/legacy_ef/css4/jquery-ui.theme.css" rel="stylesheet" type="text/css" media="screen">
                <link href="catalog/view/theme/default/stylesheet/legacy_ef/css4/select2.min.css" rel="stylesheet" type="text/css" media="screen">
                <link href="catalog/view/theme/default/stylesheet/intlTelInput.min.css" rel="stylesheet" type="text/css" media="screen">
                <link href="catalog/view/theme/default/stylesheet/legacy_ef/css4/registration.css?v=1.1.2" rel="stylesheet" type="text/css" media="screen">
        		
		<style>
            /* registration.css: fix submit button colour for ja/jabranch */
            #form_submit_ja {
                width: 100px;
                height: 50px;
                font-size: 20px;
                background-color: #C5202E;
                border-color: #FF3F65;
            }
            #label-mobile-placeholder{
                left: 50px;
            }
			
			.form-label-group label {
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			
			input.form-control:focus {
				background-color: transparent;
			}
			
			#CustRegForm .btn-primary,
			#sendTAC .btn-primary,
			#CustRegForm .btn-primary:hover,
			#sendTAC .btn-primary:hover {
				background-color:#C5202E;
				border-color:#FF3F65;
			}
			
			.form-label-group:has(.input-group .input-group-addon) label {
				width: auto;
			}
			
			#sendTAC .form-control {
				width: 100%;
				padding: 0.375rem 0.75rem;
			}
			
			.loading{
				width:100%;
				height:100%;
				position:fixed;
				left:0;
				top:0;
				display:none;
				z-index:9999;
				background: rgb(0,0,0,20%);
			}

			.loading img{
				position: absolute;width: 120px;
				height: 120px;
				left: 50%;
				top: 50%;
				margin-left: -60px;
				margin-top: -60px;
			}

            .textarea-container {
              max-width: 500px;
              margin: 20px auto;
              text-align: left;
            }

            .textarea-label {
              font-size: 16px;
              color: #444;
              margin-bottom: 8px;
              display: block;
              font-weight: bold;
            }

            .styled-textarea {
              width: 100%;
              min-height: 150px;
              max-height: 300px;
              padding: 12px 15px;
              border: 1px solid #ccc;
              border-radius: 5px;
              font-size: 14px;
              font-family: Arial, sans-serif;
              line-height: 1.6;
              resize: vertical; 
              overflow-y: auto; 
              background-color: #f9f9f9;
              color: #333;
              transition: border-color 0.3s, box-shadow 0.3s;
            }


            .styled-textarea::-webkit-scrollbar {
              width: 10px;
            }

            .styled-textarea::-webkit-scrollbar-thumb {
              background: #888;
              border-radius: 5px;
            }

            .styled-textarea::-webkit-scrollbar-thumb:hover {
              background: #555;
            }

            .styled-textarea:focus {
              border-color: #d4a017; 
              box-shadow: 0 0 5px rgba(212, 160, 23, 0.5);
              outline: none;
            }

            .styled-textarea::placeholder {
              color: #aaa;
              font-style: italic;
            }

            .textarea-container {
                background-color: #ffffff;
                /*border: 1px solid #dcdcdc;*/
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                padding: 20px;
                width: 500px;
                text-align: center;
            }

            #genAutoFill {
                background-color: #C5202E;
                color: #ffffff;
                border: none;
                padding: 10px 20px;
                font-size: 16px;
                cursor: pointer;
                transition: background-color 0.3s ease;
            }
            #genAutoFill :hover {
                background-color: #a07a00;
            }


        </style>
    <script src="https://static.revechat.com/widget/scripts/analytics/ga.js?1778005506910"></script></head>
<body><div id="reve-chat-container-div"><iframe id="reve-chat-widget-holder" src="about:blank" name="reve-chat-widget-holder" allow="camera *;microphone *" scrolling="no" style="z-index: 2147483647; min-width: 440px; width: 440px; height: 670px; position: fixed; bottom: 68px; right: 0px; display: none; border-width: medium; border-style: none; border-color: currentcolor; border-image: initial; background: transparent; border-radius: 8px; max-height: calc(100% - 80px); visibility: visible;"></iframe><iframe id="reve-chat-widget-holder-2" src="about:blank" name="reve-chat-widget-holder-2" allow="camera *;microphone *" scrolling="no" banner-position="2" style="z-index: 2147483645; min-width: 48px; width: 48px; position: fixed; bottom: 20px; right: 20px; display: block; border-width: medium; border-style: none; border-color: currentcolor; border-image: initial; background: transparent; height: 48px; visibility: visible;"></iframe><iframe id="reve-chat-media-gallery" src="about:blank" name="reve-chat-media-gallery" allow="camera *;microphone *" scrolling="no" style="z-index: 2147483647; min-width: 60px; width: 100%; height: 100%; position: fixed; bottom: 0px; display: none; border-width: medium; border-style: none; border-color: currentcolor; border-image: initial; background: transparent; left: 0px;"></iframe></div>

        
            

		<div class="loading" style="display:none;">
			<img src="https://my-cdn.publicgold.com.my/image/catalog/common/loading.gif">
		</div>
        <br><br><br>
        <div class="container">
            <a href="https://publicgold.com.my/index.php?route="><img src="https://my-cdn-test.publicgold.com.my/image/catalog/common/pbgoldlogo.png" alt="Public Gold Logo" class="pbgold-logo" style=" height:80px;"></a>
            <div class="panel">
                <div class="panel-heading">
                    <label>Customer Registration</label>
                </div>
                <div class="panel-body">
                    <div class="alert alert-info alert-dismissible fade show" role="alert">
                        <p>Remark : <br>- Children below 18 years old must be accompanied by a parent or guardian to open an account. </p>
                        <p>- After the child reaches the age of majority (18), the account can be transferred to their name alone.</p>
						<p>- Please ensure your name is updated according to your government-issued ID, inclusive of Bin, Binti, A/P, A/L and etc. in the same form to avoid rejection on profile verification.</p>
                                            </div>
                    					                                                            <br>
                                        <form action="" method="post" class="form-horizontal" name="CustRegForm" id="CustRegForm" autocomplete="off">
                        <div class="row">
                            <div class="col-md-11 col-sm-12 col-12">                                    
                                <br><table>
                                    <tbody>
                                                                                <tr>
                                            <td>
                                                <div class="form-label-group">
                                                                                                        <span style="display:none;color:red;" id="blank_name1">Full Name Cannot Be Blank.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:green;" id="name1_length">Maximum length for Full Name is 40 characters. Please key in at Full Name (line 2).</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <input type="text" class="form-control input" id="label-name" name="label-name" placeholder="Enter your name" value="" required="" autofocus="">
                                                    <label for="label-name" id="label-name-placeholder">Full Name (As Per IC)</label>
                                                </div>
                                            </td>
                                        </tr>
                                                                                <tr>
                                            <td>
                                                <div class="form-label-group">
                                                                                                        <span style="display:none;color:red;" id="blank_id_type">Please Select ID Type.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <select name="idselect" id="idselect" class="form-control" required="">
                                                                                                                                                                                                                                                                                        <option value="" selected="">ID TYPE</option>
                                                                                                                                                                    <option value="newic">NEW IC</option>
                                                                                                                                                                    <option value="passportforeign">PASSPORT / FOREIGN ID</option>
                                                                                                        </select>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr style="">
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:red;" id="blank_id">Please Enter Your ID.</span>
                                                    <span style="display:none;color:green;" id="id_validate">Maximum length for ID is 20 characters.</span>
                                                    <span style="display:none;color:red;" id="ic_validate">IC entered must be 12 characters.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr style="">
                                            <td>
                                                <div class="form-label-group">
                                                    <div class="character-wrap" style="position: relative;">
                                                        <input type="text" class="form-control input" id="label-ic" name="label-ic" placeholder="Enter your IC" max="20" value="" required="required" style="padding-right: 50px;">
                                                        <span class="remaining" style="position: absolute; opacity: 0.5; color: rgb(54, 54, 66); right: 10px; top: 50%; transform: translateY(-50%);">12</span>
                                                    </div>
                                                    <label for="label-ic" id="label-ic-placeholder">Enter IC Number without dash</label>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="align" data-toggle="tooltip" data-placement="right" title="Eg. IC : 112233445555"><svg class="svg-inline--fa fa-exclamation-circle fa-w-16" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="exclamation-circle" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zm-248 50c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"></path></svg><!-- <i class="fas fa-exclamation-circle"></i> --></span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:red;" id="blank_date">Please Enter Your Date.</span>
                                                    <span style="display:none;color:red;" id="date_validate">Date Format: YYYY-MM-DD.</span>
                                                    <span style="display:none;color:red;" id="age_validate">Children Below 18 Years Old Is Not Allow To Register Account.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group input-group date" data-provide="datepicker">
                                                    <input type="text" class="form-control datepicker hasDatepicker" id="label-dob" name="label-dob" placeholder="Date of Birth" value="" required="">
                                                    <label for="label-dob" id="label-dob-placeholder">Date of Birth (YYYY-MM-DD)</label>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:red;" id="blank_email">Please Enter Your Email.</span>
                                                    <span style="display:none;color:red;" id="email_validate">Email Address doesn't valid.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <input type="text" class="form-control input" id="label-email" name="label-email" placeholder="Enter your email" value="" inputmode="email" required="">
                                                    <label name="label-email" for="label-email">Email</label>
                                                </div>
                                            </td>
                                        </tr>
                                                                                <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:red;" id="blank_mobile">Please Enter You Mobile No.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:red;" id="blank_dialcode">Please select country dial code.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <div class="character-wrap">
                                                        <div class="iti iti--allow-dropdown iti--separate-dial-code"><div class="iti__flag-container"><div class="iti__selected-flag" role="combobox" aria-owns="iti-0__country-listbox" aria-expanded="false" tabindex="0" title="Malaysia: +60" aria-activedescendant="iti-0__item-my-preferred"><div class="iti__flag iti__my"></div><div class="iti__selected-dial-code">+60</div><div class="iti__arrow"></div></div><ul class="iti__country-list iti__hide" id="iti-0__country-listbox" role="listbox"><li class="iti__country iti__preferred iti__active" tabindex="-1" id="iti-0__item-my-preferred" role="option" data-dial-code="60" data-country-code="my" aria-selected="true"><div class="iti__flag-box"><div class="iti__flag iti__my"></div></div><span class="iti__country-name">Malaysia</span><span class="iti__dial-code">+60</span></li><li class="iti__country iti__preferred" tabindex="-1" id="iti-0__item-id-preferred" role="option" data-dial-code="62" data-country-code="id"><div class="iti__flag-box"><div class="iti__flag iti__id"></div></div><span class="iti__country-name">Indonesia</span><span class="iti__dial-code">+62</span></li><li class="iti__country iti__preferred" tabindex="-1" id="iti-0__item-bn-preferred" role="option" data-dial-code="673" data-country-code="bn"><div class="iti__flag-box"><div class="iti__flag iti__bn"></div></div><span class="iti__country-name">Brunei</span><span class="iti__dial-code">+673</span></li><li class="iti__country iti__preferred" tabindex="-1" id="iti-0__item-sg-preferred" role="option" data-dial-code="65" data-country-code="sg"><div class="iti__flag-box"><div class="iti__flag iti__sg"></div></div><span class="iti__country-name">Singapore</span><span class="iti__dial-code">+65</span></li><li class="iti__divider" role="separator" aria-disabled="true"></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-af" role="option" data-dial-code="93" data-country-code="af"><div class="iti__flag-box"><div class="iti__flag iti__af"></div></div><span class="iti__country-name">Afghanistan (&#x202B;افغانستان&#x202C;&lrm;)</span><span class="iti__dial-code">+93</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-dz" role="option" data-dial-code="213" data-country-code="dz"><div class="iti__flag-box"><div class="iti__flag iti__dz"></div></div><span class="iti__country-name">Algeria (&#x202B;الجزائر&#x202C;&lrm;)</span><span class="iti__dial-code">+213</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-au" role="option" data-dial-code="61" data-country-code="au"><div class="iti__flag-box"><div class="iti__flag iti__au"></div></div><span class="iti__country-name">Australia</span><span class="iti__dial-code">+61</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-at" role="option" data-dial-code="43" data-country-code="at"><div class="iti__flag-box"><div class="iti__flag iti__at"></div></div><span class="iti__country-name">Austria (Österreich)</span><span class="iti__dial-code">+43</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-az" role="option" data-dial-code="994" data-country-code="az"><div class="iti__flag-box"><div class="iti__flag iti__az"></div></div><span class="iti__country-name">Azerbaijan (Azərbaycan)</span><span class="iti__dial-code">+994</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-bh" role="option" data-dial-code="973" data-country-code="bh"><div class="iti__flag-box"><div class="iti__flag iti__bh"></div></div><span class="iti__country-name">Bahrain (&#x202B;البحرين&#x202C;&lrm;)</span><span class="iti__dial-code">+973</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-bd" role="option" data-dial-code="880" data-country-code="bd"><div class="iti__flag-box"><div class="iti__flag iti__bd"></div></div><span class="iti__country-name">Bangladesh (বাংলাদেশ)</span><span class="iti__dial-code">+880</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-be" role="option" data-dial-code="32" data-country-code="be"><div class="iti__flag-box"><div class="iti__flag iti__be"></div></div><span class="iti__country-name">Belgium (België)</span><span class="iti__dial-code">+32</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-bn" role="option" data-dial-code="673" data-country-code="bn"><div class="iti__flag-box"><div class="iti__flag iti__bn"></div></div><span class="iti__country-name">Brunei</span><span class="iti__dial-code">+673</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-bg" role="option" data-dial-code="359" data-country-code="bg"><div class="iti__flag-box"><div class="iti__flag iti__bg"></div></div><span class="iti__country-name">Bulgaria (България)</span><span class="iti__dial-code">+359</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-kh" role="option" data-dial-code="855" data-country-code="kh"><div class="iti__flag-box"><div class="iti__flag iti__kh"></div></div><span class="iti__country-name">Cambodia (កម្ពុជា)</span><span class="iti__dial-code">+855</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ca" role="option" data-dial-code="1" data-country-code="ca"><div class="iti__flag-box"><div class="iti__flag iti__ca"></div></div><span class="iti__country-name">Canada</span><span class="iti__dial-code">+1</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-cn" role="option" data-dial-code="86" data-country-code="cn"><div class="iti__flag-box"><div class="iti__flag iti__cn"></div></div><span class="iti__country-name">China (中国)</span><span class="iti__dial-code">+86</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-dk" role="option" data-dial-code="45" data-country-code="dk"><div class="iti__flag-box"><div class="iti__flag iti__dk"></div></div><span class="iti__country-name">Denmark (Danmark)</span><span class="iti__dial-code">+45</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-dj" role="option" data-dial-code="253" data-country-code="dj"><div class="iti__flag-box"><div class="iti__flag iti__dj"></div></div><span class="iti__country-name">Djibouti</span><span class="iti__dial-code">+253</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-eg" role="option" data-dial-code="20" data-country-code="eg"><div class="iti__flag-box"><div class="iti__flag iti__eg"></div></div><span class="iti__country-name">Egypt (&#x202B;مصر&#x202C;&lrm;)</span><span class="iti__dial-code">+20</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-gq" role="option" data-dial-code="240" data-country-code="gq"><div class="iti__flag-box"><div class="iti__flag iti__gq"></div></div><span class="iti__country-name">Equatorial Guinea (Guinea Ecuatorial)</span><span class="iti__dial-code">+240</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-fi" role="option" data-dial-code="358" data-country-code="fi"><div class="iti__flag-box"><div class="iti__flag iti__fi"></div></div><span class="iti__country-name">Finland (Suomi)</span><span class="iti__dial-code">+358</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-fr" role="option" data-dial-code="33" data-country-code="fr"><div class="iti__flag-box"><div class="iti__flag iti__fr"></div></div><span class="iti__country-name">France</span><span class="iti__dial-code">+33</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-gm" role="option" data-dial-code="220" data-country-code="gm"><div class="iti__flag-box"><div class="iti__flag iti__gm"></div></div><span class="iti__country-name">Gambia</span><span class="iti__dial-code">+220</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-de" role="option" data-dial-code="49" data-country-code="de"><div class="iti__flag-box"><div class="iti__flag iti__de"></div></div><span class="iti__country-name">Germany (Deutschland)</span><span class="iti__dial-code">+49</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-hk" role="option" data-dial-code="852" data-country-code="hk"><div class="iti__flag-box"><div class="iti__flag iti__hk"></div></div><span class="iti__country-name">Hong Kong (香港)</span><span class="iti__dial-code">+852</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-in" role="option" data-dial-code="91" data-country-code="in"><div class="iti__flag-box"><div class="iti__flag iti__in"></div></div><span class="iti__country-name">India (भारत)</span><span class="iti__dial-code">+91</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-id" role="option" data-dial-code="62" data-country-code="id"><div class="iti__flag-box"><div class="iti__flag iti__id"></div></div><span class="iti__country-name">Indonesia</span><span class="iti__dial-code">+62</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-iq" role="option" data-dial-code="964" data-country-code="iq"><div class="iti__flag-box"><div class="iti__flag iti__iq"></div></div><span class="iti__country-name">Iraq (&#x202B;العراق&#x202C;&lrm;)</span><span class="iti__dial-code">+964</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ie" role="option" data-dial-code="353" data-country-code="ie"><div class="iti__flag-box"><div class="iti__flag iti__ie"></div></div><span class="iti__country-name">Ireland</span><span class="iti__dial-code">+353</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-il" role="option" data-dial-code="972" data-country-code="il"><div class="iti__flag-box"><div class="iti__flag iti__il"></div></div><span class="iti__country-name">Israel (&#x202B;ישראל&#x202C;&lrm;)</span><span class="iti__dial-code">+972</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-jp" role="option" data-dial-code="81" data-country-code="jp"><div class="iti__flag-box"><div class="iti__flag iti__jp"></div></div><span class="iti__country-name">Japan (日本)</span><span class="iti__dial-code">+81</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-jo" role="option" data-dial-code="962" data-country-code="jo"><div class="iti__flag-box"><div class="iti__flag iti__jo"></div></div><span class="iti__country-name">Jordan (&#x202B;الأردن&#x202C;&lrm;)</span><span class="iti__dial-code">+962</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-kw" role="option" data-dial-code="965" data-country-code="kw"><div class="iti__flag-box"><div class="iti__flag iti__kw"></div></div><span class="iti__country-name">Kuwait (&#x202B;الكويت&#x202C;&lrm;)</span><span class="iti__dial-code">+965</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-la" role="option" data-dial-code="856" data-country-code="la"><div class="iti__flag-box"><div class="iti__flag iti__la"></div></div><span class="iti__country-name">Laos (ລາວ)</span><span class="iti__dial-code">+856</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-lv" role="option" data-dial-code="371" data-country-code="lv"><div class="iti__flag-box"><div class="iti__flag iti__lv"></div></div><span class="iti__country-name">Latvia (Latvija)</span><span class="iti__dial-code">+371</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ly" role="option" data-dial-code="218" data-country-code="ly"><div class="iti__flag-box"><div class="iti__flag iti__ly"></div></div><span class="iti__country-name">Libya (&#x202B;ليبيا&#x202C;&lrm;)</span><span class="iti__dial-code">+218</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-mo" role="option" data-dial-code="853" data-country-code="mo"><div class="iti__flag-box"><div class="iti__flag iti__mo"></div></div><span class="iti__country-name">Macau (澳門)</span><span class="iti__dial-code">+853</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-mw" role="option" data-dial-code="265" data-country-code="mw"><div class="iti__flag-box"><div class="iti__flag iti__mw"></div></div><span class="iti__country-name">Malawi</span><span class="iti__dial-code">+265</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-my" role="option" data-dial-code="60" data-country-code="my"><div class="iti__flag-box"><div class="iti__flag iti__my"></div></div><span class="iti__country-name">Malaysia</span><span class="iti__dial-code">+60</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-mv" role="option" data-dial-code="960" data-country-code="mv"><div class="iti__flag-box"><div class="iti__flag iti__mv"></div></div><span class="iti__country-name">Maldives</span><span class="iti__dial-code">+960</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-mr" role="option" data-dial-code="222" data-country-code="mr"><div class="iti__flag-box"><div class="iti__flag iti__mr"></div></div><span class="iti__country-name">Mauritania (&#x202B;موريتانيا&#x202C;&lrm;)</span><span class="iti__dial-code">+222</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-np" role="option" data-dial-code="977" data-country-code="np"><div class="iti__flag-box"><div class="iti__flag iti__np"></div></div><span class="iti__country-name">Nepal (नेपाल)</span><span class="iti__dial-code">+977</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-nl" role="option" data-dial-code="31" data-country-code="nl"><div class="iti__flag-box"><div class="iti__flag iti__nl"></div></div><span class="iti__country-name">Netherlands (Nederland)</span><span class="iti__dial-code">+31</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-nz" role="option" data-dial-code="64" data-country-code="nz"><div class="iti__flag-box"><div class="iti__flag iti__nz"></div></div><span class="iti__country-name">New Zealand</span><span class="iti__dial-code">+64</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ng" role="option" data-dial-code="234" data-country-code="ng"><div class="iti__flag-box"><div class="iti__flag iti__ng"></div></div><span class="iti__country-name">Nigeria</span><span class="iti__dial-code">+234</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-no" role="option" data-dial-code="47" data-country-code="no"><div class="iti__flag-box"><div class="iti__flag iti__no"></div></div><span class="iti__country-name">Norway (Norge)</span><span class="iti__dial-code">+47</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-om" role="option" data-dial-code="968" data-country-code="om"><div class="iti__flag-box"><div class="iti__flag iti__om"></div></div><span class="iti__country-name">Oman (&#x202B;عُمان&#x202C;&lrm;)</span><span class="iti__dial-code">+968</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ps" role="option" data-dial-code="970" data-country-code="ps"><div class="iti__flag-box"><div class="iti__flag iti__ps"></div></div><span class="iti__country-name">Palestine (&#x202B;فلسطين&#x202C;&lrm;)</span><span class="iti__dial-code">+970</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-pg" role="option" data-dial-code="675" data-country-code="pg"><div class="iti__flag-box"><div class="iti__flag iti__pg"></div></div><span class="iti__country-name">Papua New Guinea</span><span class="iti__dial-code">+675</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ph" role="option" data-dial-code="63" data-country-code="ph"><div class="iti__flag-box"><div class="iti__flag iti__ph"></div></div><span class="iti__country-name">Philippines</span><span class="iti__dial-code">+63</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-pt" role="option" data-dial-code="351" data-country-code="pt"><div class="iti__flag-box"><div class="iti__flag iti__pt"></div></div><span class="iti__country-name">Portugal</span><span class="iti__dial-code">+351</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-qa" role="option" data-dial-code="974" data-country-code="qa"><div class="iti__flag-box"><div class="iti__flag iti__qa"></div></div><span class="iti__country-name">Qatar (&#x202B;قطر&#x202C;&lrm;)</span><span class="iti__dial-code">+974</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ru" role="option" data-dial-code="7" data-country-code="ru"><div class="iti__flag-box"><div class="iti__flag iti__ru"></div></div><span class="iti__country-name">Russia (Россия)</span><span class="iti__dial-code">+7</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-sa" role="option" data-dial-code="966" data-country-code="sa"><div class="iti__flag-box"><div class="iti__flag iti__sa"></div></div><span class="iti__country-name">Saudi Arabia (&#x202B;المملكة العربية السعودية&#x202C;&lrm;)</span><span class="iti__dial-code">+966</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-sl" role="option" data-dial-code="232" data-country-code="sl"><div class="iti__flag-box"><div class="iti__flag iti__sl"></div></div><span class="iti__country-name">Sierra Leone</span><span class="iti__dial-code">+232</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-sg" role="option" data-dial-code="65" data-country-code="sg"><div class="iti__flag-box"><div class="iti__flag iti__sg"></div></div><span class="iti__country-name">Singapore</span><span class="iti__dial-code">+65</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-so" role="option" data-dial-code="252" data-country-code="so"><div class="iti__flag-box"><div class="iti__flag iti__so"></div></div><span class="iti__country-name">Somalia (Soomaaliya)</span><span class="iti__dial-code">+252</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-kr" role="option" data-dial-code="82" data-country-code="kr"><div class="iti__flag-box"><div class="iti__flag iti__kr"></div></div><span class="iti__country-name">South Korea (대한민국)</span><span class="iti__dial-code">+82</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-lk" role="option" data-dial-code="94" data-country-code="lk"><div class="iti__flag-box"><div class="iti__flag iti__lk"></div></div><span class="iti__country-name">Sri Lanka (ශ්&zwj;රී ලංකාව)</span><span class="iti__dial-code">+94</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-sd" role="option" data-dial-code="249" data-country-code="sd"><div class="iti__flag-box"><div class="iti__flag iti__sd"></div></div><span class="iti__country-name">Sudan (&#x202B;السودان&#x202C;&lrm;)</span><span class="iti__dial-code">+249</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-sz" role="option" data-dial-code="268" data-country-code="sz"><div class="iti__flag-box"><div class="iti__flag iti__sz"></div></div><span class="iti__country-name">Swaziland</span><span class="iti__dial-code">+268</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-se" role="option" data-dial-code="46" data-country-code="se"><div class="iti__flag-box"><div class="iti__flag iti__se"></div></div><span class="iti__country-name">Sweden (Sverige)</span><span class="iti__dial-code">+46</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ch" role="option" data-dial-code="41" data-country-code="ch"><div class="iti__flag-box"><div class="iti__flag iti__ch"></div></div><span class="iti__country-name">Switzerland (Schweiz)</span><span class="iti__dial-code">+41</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-tw" role="option" data-dial-code="886" data-country-code="tw"><div class="iti__flag-box"><div class="iti__flag iti__tw"></div></div><span class="iti__country-name">Taiwan (台灣)</span><span class="iti__dial-code">+886</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-th" role="option" data-dial-code="66" data-country-code="th"><div class="iti__flag-box"><div class="iti__flag iti__th"></div></div><span class="iti__country-name">Thailand (ไทย)</span><span class="iti__dial-code">+66</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-tn" role="option" data-dial-code="216" data-country-code="tn"><div class="iti__flag-box"><div class="iti__flag iti__tn"></div></div><span class="iti__country-name">Tunisia (&#x202B;تونس&#x202C;&lrm;)</span><span class="iti__dial-code">+216</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-tr" role="option" data-dial-code="90" data-country-code="tr"><div class="iti__flag-box"><div class="iti__flag iti__tr"></div></div><span class="iti__country-name">Turkey (Türkiye)</span><span class="iti__dial-code">+90</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ae" role="option" data-dial-code="971" data-country-code="ae"><div class="iti__flag-box"><div class="iti__flag iti__ae"></div></div><span class="iti__country-name">United Arab Emirates (&#x202B;الإمارات العربية المتحدة&#x202C;&lrm;)</span><span class="iti__dial-code">+971</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-gb" role="option" data-dial-code="44" data-country-code="gb"><div class="iti__flag-box"><div class="iti__flag iti__gb"></div></div><span class="iti__country-name">United Kingdom</span><span class="iti__dial-code">+44</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-us" role="option" data-dial-code="1" data-country-code="us"><div class="iti__flag-box"><div class="iti__flag iti__us"></div></div><span class="iti__country-name">United States</span><span class="iti__dial-code">+1</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-vn" role="option" data-dial-code="84" data-country-code="vn"><div class="iti__flag-box"><div class="iti__flag iti__vn"></div></div><span class="iti__country-name">Vietnam (Việt Nam)</span><span class="iti__dial-code">+84</span></li><li class="iti__country iti__standard" tabindex="-1" id="iti-0__item-ye" role="option" data-dial-code="967" data-country-code="ye"><div class="iti__flag-box"><div class="iti__flag iti__ye"></div></div><span class="iti__country-name">Yemen (&#x202B;اليمن&#x202C;&lrm;)</span><span class="iti__dial-code">+967</span></li></ul></div><div class="character-wrap" style="position: relative;"><input type="text" class="form-control input" id="label-mobile" name="label-mobile" placeholder="Enter your Mobile No" value="" inputmode="tel" required="" data-intl-tel-input-id="0" style="padding-left: 87px; padding-right: 35px;"><span class="remaining" style="position: absolute; opacity: 0.5; color: rgb(54, 54, 66); right: 10px; top: 50%; transform: translateY(-50%);">20</span></div></div>
                                                        <span class="remaining"></span>
                                                    </div>                                                    
                                                    <label for="label-mobile" id="label-mobile-placeholder">Mobile No</label>
                                                </div>
                                                <input type="hidden" id="label-mobile-dialcode" name="label-mobile-dialcode" value="60">
                                            </td>
                                        </tr>
										
                                                                                										                                         <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <input type="text" class="form-control" id="label-intro-pgcode" name="label-intro-pgcode" value="PG00104897" placeholder="Introducer PG Code" required="" readonly="" data-toggle="modal" data-target="#CheckIntroducer" data-focus-trigger="1">
                                                    <label for="label-intro-pgcode">Introducer PG Code</label>
                                                </div>
                                            </td>
											<td>
                                                <span class="align" data-toggle="tooltip" data-placement="right" title="Introducer means someone that introduce, lead or bring you to Public Gold by whatever methods. If you do not have any introducer, please put Public Gold as your introducer."><svg class="svg-inline--fa fa-question-circle fa-w-16" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="question-circle" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zM262.655 90c-54.497 0-89.255 22.957-116.549 63.758-3.536 5.286-2.353 12.415 2.715 16.258l34.699 26.31c5.205 3.947 12.621 3.008 16.665-2.122 17.864-22.658 30.113-35.797 57.303-35.797 20.429 0 45.698 13.148 45.698 32.958 0 14.976-12.363 22.667-32.534 33.976C247.128 238.528 216 254.941 216 296v4c0 6.627 5.373 12 12 12h56c6.627 0 12-5.373 12-12v-1.333c0-28.462 83.186-29.647 83.186-106.667 0-58.002-60.165-102-116.531-102zM256 338c-25.365 0-46 20.635-46 46 0 25.364 20.635 46 46 46s46-20.636 46-46c0-25.365-20.635-46-46-46z"></path></svg><!-- <i class="fas fa-question-circle"></i> --></span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <input type="text" class="form-control" id="label-intro-name" name="label-intro-name" value="HAMIRUL HAFIZAL BIN MOHAMAD KAMARUDDIN " placeholder="Introducer Name" required="" readonly="" data-toggle="modal" data-target="#CheckIntroducer" data-focus-trigger="1">
                                                    <label for="label-intro-name">Introducer Name</label>
                                                </div>
                                            </td>
                                        </tr>
										                                        <tr>
                                            <td>
                                                <div class="form-label-group">
                                                    <span style="display:none;color:red;" id="blank_branch">Please Select Your Preferred Branch.</span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                                <td>
                                                    <div class="form-label-group">
                                                        <div class="dropdown">
                                                            <select name="upreferredbranch" id="upreferredbranch" class="form-control select2-hidden-accessible" required="" data-select2-id="select2-data-upreferredbranch" tabindex="-1" aria-hidden="true">
                                                                                                                                    <option value="">PREFERRED BRANCH</option>
                                                                                                                                    <option value="1">Alor Setar, Kedah</option>
                                                                                                                                    <option value="2">Ampang, Kuala Lumpur</option>
                                                                                                                                    <option value="3">Bangi, Selangor</option>
                                                                                                                                    <option value="4">Bdr Sunway, Selangor</option>
                                                                                                                                    <option value="6">Bt Berendam, Malacca</option>
                                                                                                                                    <option value="10">Ipoh, Perak</option>
                                                                                                                                    <option value="11">Johor Bahru, Johor</option>
                                                                                                                                    <option value="12">Kota Bharu, Kelantan</option>
                                                                                                                                    <option value="13">Kuala Terengganu, Terengganu</option>
                                                                                                                                    <option value="14">Kuantan, Pahang</option>
                                                                                                                                    <option value="17">Relau, Penang</option>
                                                                                                                                    <option value="18" selected="" data-select2-id="select2-data-2-4ld3">Seremban, Negeri Sembilan</option>
                                                                                                                                    <option value="19">Sungai Petani, Kedah</option>
                                                                                                                                    <option value="21">Kota Kinabalu, Sabah</option>
                                                                                                                                    <option value="22">Kuching, Sarawak</option>
                                                                                                                                    <option value="23">Miri, Sarawak</option>
                                                                                                                                    <option value="34">Menara Public Gold, Kuala Lumpur</option>
                                                                                                                                    <option value="135">Tawau, Sabah</option>
                                                                                                                            </select><span class="select2 select2-container select2-container--default" dir="ltr" data-select2-id="select2-data-1-lgq8" style="width: 100%;"><span class="selection"><span class="select2-selection select2-selection--single form-width" role="combobox" aria-haspopup="true" aria-expanded="false" tabindex="0" aria-disabled="false" aria-labelledby="select2-upreferredbranch-container"><span class="select2-selection__rendered" id="select2-upreferredbranch-container" role="textbox" aria-readonly="true" title="Seremban, Negeri Sembilan">Seremban, Negeri Sembilan</span><span class="select2-selection__arrow" role="presentation"><b role="presentation"></b></span></span></span><span class="dropdown-wrapper" aria-hidden="true"></span></span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        																				
										<tr>
                                            <td>
                                                <div class="form-label-group">
                                                                                                    </div>
                                            </td>
                                        </tr>
																				
                                                                                										
                                        <tr>
                                            <td>
                                                <div class="form-check form-label">
                                                    &nbsp;&nbsp;&nbsp;&nbsp;
                                                    <input type="checkbox" class="form-check-input" id="newsletter" name="newsletter" value="1" checked="">
                                                    <label class="form-check-label" for="newsletter" style="font-size: 0.8rem;">Subscribe to newsletter</label>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <div class="form-check form-label">
													<p class="form-width" style="height: fit-content;font-size: 0.8rem;">I hereby declare that the information given above is true, accurate and complete. I understand that my account registration application is subject to approval. In the event of my application has been approved, I hereby undertake and agree to be bound in all respects by the company's regulation.</p>
                                                    <p class="form-width" style="height: fit-content;font-size: 0.8rem;">By proceeding, I confirm that the information provided is true, accurate, and complete. I understand that this application is subject to approval by Public Gold. I agree to be bound by the company’s regulations, <a href="https://publicgold.com.my/index.php?route=information/information&amp;information_id=5" target="_blank">Terms &amp; Conditions</a>, and <a href="https://publicgold.com.my/index.php?route=information/information&amp;information_id=741" target="_blank">Privacy Policy</a>.<br> If this registration is completed with the assistance of an introducer, the introducer confirms that the registration is done with the full knowledge and consent of the customer, and that all information provided is accurate and authorized by the customer.</p>
                                                </div>
                                            </td>
										</tr>
                                        <tr>
                                            <td>
                                                <div class="float">
                                                    <button type="button" class="btn btn-info" id="form_submit">Proceed</button>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                    </tbody>
                                </table>
                                <br>
                            </div>
                        </div>
                    </form>
                    
					<!-- The [Check PG Code] Modal -->
					<div class="modal fade" id="CheckIntroducer" tabindex="-1">
						<div class="modal-dialog">
							<div class="modal-content">
								<!-- Modal Header -->
								<div class="modal-header">
									<h4 class="modal-title">Enter Introducer's PG Code</h4>
									<button type="button" class="close" data-dismiss="modal">×</button>
								</div>

								<!-- Modal body -->
								<div class="modal-body">
									<span style="color:red;">*Please click 'CHECK' button to verify PG Code</span><br>
									<input type="text" class="intro-modal" placeholder="Enter Introducer's PG Code" name="uintroducer" id="uintroducer" value="" required="">
									<!--<button class="btn btn-warning check-intro" id="btncheckintroducer">Check</button>-->
									<button type="button" class="btn btn-danger" id="btncheckintroducer">Check</button>
									<br><br>
									<input type="text" id="uintrocode" class="intro-modal" placeholder="INTRODUCER PG CODE" style="background-color : #d1d1d1;" value="" readonly="">
									<br> <br>
									<input type="text" id="uintroname" class="intro-modal" placeholder="INTRODUCER NAME" style="background-color : #d1d1d1;" value="" readonly="">
								</div>

								<!-- Modal footer -->
								<div class="modal-footer">
									<!--<button type="button" class="btn btn-danger" id="clear">Clear</button>
									<button type="button" class="btn btn-info" id="proceed">Proceed</button>-->
									<button type="button" class="btn btn-outline-secondary" id="clear">Clear</button>
									<button type="button" class="btn btn-danger" id="proceed">Proceed</button>
								</div>
							</div>
						</div>
					</div>
					
										                </div>
            </div>
            <br><br><br>
        </div>
        <script type="text/javascript">
            window.onload = function(){
                $('#CheckIntroducer').on('shown.bs.modal', function() {
                    $('#uintroducer').delay(1000).focus().select();
                });
                
                $("#uintroducer").keypress(function(event) { 
                    if (event.keyCode === 13) { 
                        $("#btncheckintroducer").click(); 
                    } 
                }); 
            }
        </script>
        
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js/jquery-ui.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/moment.min.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/all.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/registration/registration.js?v=1.1.20" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/js/intlTelInput.min.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/bootstrap.min.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/jquery.ui.datepicker.monthyearpicker.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/character-counter.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/theme/default/stylesheet/legacy_ef/js4/select2.min.js" type="text/javascript" charset="utf-8"></script>
                <script src="catalog/view/javascript/revechat.js" type="text/javascript" charset="utf-8"></script>
                
					<script>
				conf ={"tac":{"resend_duration":300}}
			</script>
				
        <script>
            //@todo:register.js
            $(document).ready(function(){
                // --- temporary --- //
                // doesnt need to copy over to file, just for mitigation during implment
                $("#btncheckintroducer").off("click");
                function pad (str, max) {
                    str = str.toString();
                    return str.length < max ? pad("0" + str, max) : str;
                }
                // --- temporary --- //
                
                //CHECK INTRODUCER
                $("#btncheckintroducer").on("click", function() {
                    if ($("[name='uintroducer']").val() !== "") {
                        var pgcode = $("[name='uintroducer']").val();

                        // check is [pgcode] key in by customer starts with 'PG'?
                        // To prevent cust didn't key in zero, for eg: cust key in [PG12] not [PG000012], so need to remove the prefix [PG]
                        if (pgcode.match("^PG") || pgcode.match("^pg")) { 
                            pgcode = pgcode.substring(2);
                        }

                        //After removed the prefix ['PG'], then need to determine and str_pad() the integers
                        //OR
                        //if [pgcode] not start with 'PG'
                        if (pgcode >= 54600) {
                            pgcode = pad(pgcode,8);
                        } else if(pgcode <= 54599) {
                            pgcode = pad(pgcode,6);
                        }

                        //Last, add the prefix ['PG']
                        pgcode = 'PG' + pgcode;

                        $.ajax({
                            type : "post",
                            url : "https://publicgold.com.my/index.php?route=account/register/getIntroducer",
                            data : {pgcode:pgcode},
                            success : function(response) {
                                if (response.success && response.name) {
                                    alert('Valid Introducer');
									$("#uintroname").data('resp', response);
                                    $("#uintroname").val(response.name);
                                    $("#uintrocode").val(pgcode);
                                } else {
                                    alert('Invalid Introducer');
                                    //clear input field
                                    $("#uintroname").val(''); 
                                    $("#uintroname").attr("placeholder", "INTRODUCER NAME");
                                    $("#uintrocode").val('');
                                    $("#uintrocode").attr("placeholder", "INTRODUCER PG CODE");
                                }

                            },
                            error: function() {
                                console.log('AJAX Error when check PG Code');
                                alert('Invalid Introducer');
                                //clear input field
                                $("#uintroname").val(''); 
                                $("#uintroname").attr("placeholder", "INTRODUCER NAME");
                                $("#uintrocode").val('');
                                $("#uintrocode").attr("placeholder", "INTRODUCER PG CODE");
                            }

                        });
                    } else {
                    alert("No introducer entered");
                    }    
                });
            });
			
						
			$('[data-toggle="modal"][data-focus-trigger]').focus(function(e){
				$($(e.target).data('target')).modal('toggle');
			});
			
			$('#label-tac').on('beforeinput', (e) => {
				if (e.originalEvent.data) {
					str_input = e.originalEvent.data.replace(/[^0-9]/g,'');
					if (str_input.length != e.originalEvent.data.length) {
						e.preventDefault();
						
						return;
					}
				}
			});
            
                </script>
        <!--<script>
            // @todo
            // additional script to fix things i found during test
            // to move to registration.js
            // remove placeholder style if nothing was input and off focus
            $('.input').on('focusout',function(e){
                if (this.value.length == 0) {
                    console.log($(this).closest('.form-label-group').find('label'));
                    $(this).closest('.form-label-group').find('label').removeAttr('style');
                }
            });
            
        </script>-->
    



<script>
$(document).ready(function(){
    var inputcustomertel = document.querySelector("#label-mobile");
    var phone_number = window.intlTelInput(document.querySelector("#label-mobile"), {
      separateDialCode: true,
      initialCountry:"my",
      onlyCountries: ["my", "bn", "sg", "id", "AF", "DZ", "AU", "BD", "BG", "CA", "CN", "DJ", "EG", "FI", "FR", "GM", "DE", "IN", "IL", "JP", "LA", "LV", "LY", "MW", "MV", "MR", "NP", "NL", "SL", "LK", "SZ", "CH", "TH", "TN", "AE", "GB", "US", "VN", "NZ", "KR", "QA", "SA", "KH", "IE", "BE", "HK", "NO", "PT", "AT", "SO", "PG", "MO", "TR", "OM", "PS", "JO", "SE", "SD", "YE", "GQ", "NG", "BH", "PH", "IQ", "TW", "KW", "RU", "DK", "AZ"],
	  preferredCountries: ["my", "id", "bn", "sg"],
    });

    inputcustomertel = document.querySelector("#label-mobile");

    var previousRawValue = "";
    inputcustomertel.addEventListener("input", function () {
        let rawValue = inputcustomertel.value.trim();  
        if (rawValue !== "") {
            previousRawValue = rawValue.replace(/^\+/, "");
        }
    });

    inputcustomertel.addEventListener("countrychange", function() {
        if(previousRawValue){
            $("#label-mobile").val(previousRawValue);
        }
        $("#label-mobile-dialcode").val(phone_number.getSelectedCountryData()['dialCode']);
    });

    $("#label-mobile-dialcode").val(phone_number.getSelectedCountryData()['dialCode']);
	
	$('#label-mobile').characterCounter({
        max: 20,
        opacity :".5"
    });

    $("#genAutoFill").on("click", function(event){
        event.preventDefault();
        const inputText = $('#userInput').val();
        const post_form_type = 'default';
        $.ajax({
            type : "post",
            url : "",
            data : {input:inputText,form_type:post_form_type},
            success : function(response) { 
                $.each(response, function(index, value) {
                    if ($('#label-' + index).length) {

                        $('#label-' + index).val(value).trigger('keyup'); 
                        if(index == 'mobile'){
                            if (value.length >= 20) {
                                alert('The mobile number exceeds 20 characters. Please provide a valid number.');
                                $('#label-' + index).val('');
                                return;
                            }else{
                                phone_number.setNumber(value);
                                inputcustomertel.dispatchEvent(new Event("input", { bubbles: true }));
                                const dialCode = phone_number.getSelectedCountryData()['dialCode'];
                                if (!dialCode || dialCode.trim() === "") {
                                    alert('Please select a valid country dial code.');
                                    return;
                                }
                                $("#label-mobile-dialcode").val(dialCode);
                            }   
                        }
                        if(index == 'ic' || index == 'parent-ic'){
                            if (value.length >= 20) {
                                alert('The ID input exceeds 20 characters. Please provide a valid ID.');
                                $('#label-' + index).val('');
                                return;
                            }
                        }
                        if(index == 'ic'){
                            $('#label-' + index).trigger('input');
                        }
                    }else if($('#label-junior-' + index).length){
                        $('#label-junior-' + index).val(value); 
                        if(index == 'ic'){
                            if (value.length >= 20) {
                                alert('The Junior ID input exceeds 20 characters. Please provide a valid ID.');
                                $('#label-junior-' + index).val('');
                                return;
                            }
                            $('#label-junior-' + index).trigger('input');
                        }
                    }else if($('#' + index).length){
                        $('#' + index).val(value); 
                        $('#' + index).trigger('change');
                    }
                });
            },
            error: function() {
                alert('Invalid Format detected');
            }
        });
    });

});


</script><div id="ui-datepicker-div" class="ui-datepicker ui-widget ui-widget-content ui-helper-clearfix ui-corner-all"></div></body></html>