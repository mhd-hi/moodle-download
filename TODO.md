# Issues
- 

# Enhancements
- Add logs inside the extension UI.
    - It should show the logs that we're doing i nthe UI. Limit it to 5 lines. It should be scrollable. It should appear after the files-container. So it will receive data and synchronize on the spot.
- If file is too large, add that error in the UI 
- can you make a config file and add the MAX_FILE_SIZE and also add a new array that accepts the file type, by defaut we would accept pdf only. We will still add it to the files-containers but its unselected by default. The other valid file types are by default selected (for now only pdf). 
- Currently it only works on pages when there are no tiles in the page.
 it says: No downloadable files found on this page
Make sure you're on a Moodle course page. Here's the jspath :document.querySelector("#multi_section_tiles")

Here's the element : 
<ul class="tiles" id="multi_section_tiles">
                
                <li class="tile tile-clickable tilestyle-1" id="tile-1" data-section="1" data-true-sectionid="307232">
                    <div class="tile-bg"></div>
                    <a class="tile-link" href="https://ena.etsmtl.ca/course/view.php?id=26686&amp;section=1" data-section="1" id="sectionlink-1" aria-label="Calendrier, opens detail in pop up, link">
                
                            <div class="tile-content" id="tilecontent-1">
                                <div class="tile-top" id="tileTop-1">
                                    <div class="tileiconcontainer" id="tileicon_1">
                                        
                                        
                                        <span class="tile-icon">
                                            
                                            
                                            <i class="icon fa fa-pie-chart fa-fw " aria-hidden="true"></i>
                                        </span>                                    </div>
                                    <div class="tiletopright" id="tiletopright-1" aria-hidden="true">
                                        
                                        
                                    </div>
                                </div>
                                <div class="tile-text" id="tileText-1">
                                    <div class="tile-textinner" id="tileTextin-1">
                                      <h3>Calendrier</h3>
                                    </div>
                                </div>
                            </div>
                
                    </a>
                    
                </li>                
                <li class="tile tile-clickable tilestyle-1" id="tile-2" data-section="2" data-true-sectionid="307233">
                    <div class="tile-bg"></div>
                    <a class="tile-link" href="https://ena.etsmtl.ca/course/view.php?id=26686&amp;section=2" data-section="2" id="sectionlink-2" aria-label="Informations, opens detail in pop up, link">
                
                            <div class="tile-content" id="tilecontent-2">
                                <div class="tile-top" id="tileTop-2">
                                    <div class="tileiconcontainer" id="tileicon_2">
                                        
                                        
                                        <span class="tile-icon">
                                            
                                            
                                            <i class="icon fa fa-pie-chart fa-fw " aria-hidden="true"></i>
                                        </span>                                    </div>
                                    <div class="tiletopright" id="tiletopright-2" aria-hidden="true">
                                        
                                        
                                    </div>
                                </div>
                                <div class="tile-text" id="tileText-2">
                                    <div class="tile-textinner" id="tileTextin-2">
                                      <h3>Informations</h3>
                                    </div>
                                </div>
                            </div>
                
                    </a>
                    
                </li><li class="section course-section main moveablesection" style="display: none; max-width: 492px;" id="section-2" data-section="2" data-sectionid="307233"></li><li class="section course-section main moveablesection" style="max-width: 492px; display: none;" id="section-1" data-section="1" data-sectionid="307232"><div class="format_tiles_section_content">
    <div class="left side"></div>
        <div class="pagesechead">
            <div class="sectiontitlecontainer">
                <div class="sectiontitle" id="sectiontitle1">
                    <h2>Calendrier</h2>
                    
                </div>
            </div>
        </div>
    <div class="right side">
            <div class="sectionbuttons">
                <button class="sectionbutton closesectionbtn" id="closesectionbtn-1" title="Fermer" data-section="1">
                <span class="d-flex justify-content-center align-items-center h-100">
                    <i class="icon fa fa-close fa-fw " title="Fermer" role="img" aria-label="Fermer"></i>
                </span>
                </button>
            </div>
    </div>
        
        <div class="summary"></div>
        <ul class="format-tiles-cm-list nosubtiles">
            
                
                
                
                    <li class="activity activity-wrapper resource modtype_resource 
                             mod_resource modtype_pdf  " id="module-1708135" data-for="cmitem" data-id="1708135" data-cmid="1708135" data-contextid="2293834" data-modinstance="797239" data-modtype="resource_pdf" data-title="Calendrier PHY144 ETE2025" data-completion="0">
                            <div class="activity-item " data-activityname="Calendrier PHY144 ETE2025">
                            

                                        <div class="activity-basis d-flex align-items-center">
                                            <div class="d-flex flex-column flex-md-row w-100 align-self-start">
                                                            
                                                                            <div class="activity-icon activityiconcontainer smaller content courseicon align-self-start mr-2 ">
                                                                                <img src="https://ena.etsmtl.ca/theme/image.php/boost_ets/format_tiles/1749751036/resource_subtile/pdf" class="activityicon format-tiles-large-activity-icon" alt="Icône Fichier">
                                                                            </div>
                                                                <div class="activity-name-area activity-instance d-flex flex-column mr-2 align-self-center">
                                                                    <div class="activitytitle media  modtype_resource position-relative align-self-start">
                                                                        <div class="media-body align-self-center">
                                                                            <div class="activityname">
                                                                                        <a href="https://ena.etsmtl.ca/mod/resource/view.php?id=1708135" class="aalink stretched-link" onclick="window.open('https://ena.etsmtl.ca/mod/resource/view.php?id=1708135&amp;redirect=1'); return false;"><span class="instancename">Calendrier PHY144 ETE2025</span></a>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                        
                                        
                                                    <div class="activity-info mt-1 mt-md-0">
                                                            <div data-region="activity-information" data-activityname="Calendrier PHY144 ETE2025" class="activity-information">
                                                            </div>
                                                    </div>
                                            </div>
                                        
                                        </div>
                                        
                                        <div class="description">
                                        </div>
                            </div>
                    </li>
        </ul>


</div></li>                
                <li class="tile tile-clickable tilestyle-1" id="tile-5" data-section="5" data-true-sectionid="307236">
                    <div class="tile-bg"></div>
                    <a class="tile-link" href="https://ena.etsmtl.ca/course/view.php?id=26686&amp;section=5" data-section="5" id="sectionlink-5" aria-label="Bloc 1 Statique, opens detail in pop up, link">
                
                            <div class="tile-content" id="tilecontent-5">
                                <div class="tile-top" id="tileTop-5">
                                    <div class="tileiconcontainer" id="tileicon_5">
                                        
                                        
                                        <span class="tile-icon">
                                            
                                            
                                            <i class="icon fa fa-pie-chart fa-fw " aria-hidden="true"></i>
                                        </span>                                    </div>
                                    <div class="tiletopright" id="tiletopright-5" aria-hidden="true">
                                        
                                        
                                    </div>
                                </div>
                                <div class="tile-text" id="tileText-5">
                                    <div class="tile-textinner" id="tileTextin-5">
                                      <h3>Bloc 1 Statique</h3>
                                    </div>
                                </div>
                            </div>
                
                    </a>
                    
                </li>                
                <li class="tile tile-clickable tilestyle-1" id="tile-6" data-section="6" data-true-sectionid="307237">
                    <div class="tile-bg"></div>
                    <a class="tile-link" href="https://ena.etsmtl.ca/course/view.php?id=26686&amp;section=6" data-section="6" id="sectionlink-6" aria-label="Aide-Mémoire, opens detail in pop up, link">
                
                            <div class="tile-content" id="tilecontent-6">
                                <div class="tile-top" id="tileTop-6">
                                    <div class="tileiconcontainer" id="tileicon_6">
                                        
                                        
                                        <span class="tile-icon">
                                            
                                            
                                            <i class="icon fa fa-pie-chart fa-fw " aria-hidden="true"></i>
                                        </span>                                    </div>
                                    <div class="tiletopright" id="tiletopright-6" aria-hidden="true">
                                        
                                        
                                    </div>
                                </div>
                                <div class="tile-text" id="tileText-6">
                                    <div class="tile-textinner" id="tileTextin-6">
                                      <h3>Aide-Mémoire</h3>
                                    </div>
                                </div>
                            </div>
                    </a>
                </li>
            <li class="tile spacer" aria-hidden="true"></li>
            <li class="tile spacer" aria-hidden="true"></li>
            <li class="tile spacer" aria-hidden="true"></li>
            <li class="tile spacer" aria-hidden="true"></li>
            <li class="tile spacer" aria-hidden="true"></li>
            <li class="tile spacer" aria-hidden="true"></li>
            <li class="tile spacer" aria-hidden="true" id="lasttile"></li><li class="section course-section main moveablesection" style="display: none; max-width: 492px;" id="section-6" data-section="6" data-sectionid="307237"></li><li class="section course-section main moveablesection" style="display: none; max-width: 492px;" id="section-5" data-section="5" data-sectionid="307236"></li></ul>