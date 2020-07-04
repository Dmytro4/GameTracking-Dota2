
// ----------------------------------------------------------------------------
//   Screen Handling functions
// ----------------------------------------------------------------------------

function CreateProgressScreen( panelID )
{
	var screenPanel = $.CreatePanel( 'Panel', $( '#ProgressScreens' ), panelID );
	screenPanel.AddClass( 'ProgressScreen' );
	return screenPanel;
}

function ShowProgressScreen( screenPanel )
{
	var screensContainer = $( '#ProgressScreens' );
	for ( var i = 0; i < screensContainer.GetChildCount() ; ++i )
	{
		var otherScreenPanel = screensContainer.GetChild( i );
		otherScreenPanel.SetHasClass( 'ShowScreen', otherScreenPanel == screenPanel );
	}
}

function StartNewScreen( panelID )
{
	var screenPanel = CreateProgressScreen( panelID );
	ShowProgressScreen( screenPanel );
	return screenPanel;
}


function GetScreenLinksContainer()
{
	// This is sorta hacky, but we need to reach into the parent's layout file to find our button container.
	return $.GetContextPanel().GetParent().FindPanelInLayoutFile( 'ProgressScreenButtons' );
}

/* Called from C++ code */
function ResetScreens()
{
	$( '#ProgressScreens' ).RemoveAndDeleteChildren();
	GetScreenLinksContainer().RemoveAndDeleteChildren();
}

function AddScreenLink( screenPanel, linkClass, tooltipText, activateFunction )
{
	var link = $.CreatePanel( 'Button', GetScreenLinksContainer(), '' );
	link.AddClass( 'ProgressScreenButton' );
	link.AddClass( linkClass );

	link.SetPanelEvent( 'onactivate', function ()
	{
		$.DispatchEvent( 'DOTAPostGameProgressShowSummary', screenPanel );
		ShowProgressScreen( screenPanel );
		if ( activateFunction )
		{
			activateFunction();
		}
	} );

	link.SetPanelEvent( 'onmouseover', function () { $.DispatchEvent( 'UIShowTextTooltip', link, tooltipText ); } );
	link.SetPanelEvent( 'onmouseout', function () { $.DispatchEvent( 'UIHideTextTooltip', link ); } );

	return link;
}

function AddScreenLinkAction( screenPanel, linkClass, tooltipText, activateFunction )
{
	RunFunctionAction.call( this, function () { AddScreenLink( screenPanel, linkClass, tooltipText, activateFunction ); } );
}
AddScreenLinkAction.prototype = new RunFunctionAction();


// ----------------------------------------------------------------------------
//   Skip Ahead Functions
// ----------------------------------------------------------------------------

var g_bSkipAheadActions = false;

function IsSkippingAhead()
{
	return g_bSkipAheadActions;
}

function SetSkippingAhead( bSkipAhead )
{
	if ( g_bSkipAheadActions == bSkipAhead )
		return;

	if ( bSkipAhead )
	{
		$.DispatchEvent( "PostGameProgressSkippingAhead" );
	}
	$.GetContextPanel().SetHasClass( 'SkippingAhead', bSkipAhead );
	g_bSkipAheadActions = bSkipAhead;

	if ( bSkipAhead )
	{
		PlayUISoundScript( "ui_generic_button_click" );
	}
}
function StopSkippingAhead() { SetSkippingAhead( false ); }
function StartSkippingAhead() { SetSkippingAhead( true ); }

// ----------------------------------------------------------------------------
//   StopSkippingAheadAction
// 
//   Define a point at which we stop skipping (usually the end of a screen)
// ----------------------------------------------------------------------------

// Use a StopSkippingAheadAction to define a stopping point
function StopSkippingAheadAction()
{
}
StopSkippingAheadAction.prototype = new BaseAction();
StopSkippingAheadAction.prototype.update = function ()
{
	StopSkippingAhead();
	return false;
}


// ----------------------------------------------------------------------------
//   SkippableAction
// 
//   Wrap a SkippableAction around any other action to have it skip ahead
//   whenever we're supposed to skip ahead. SkippableAction guarantees that the
//   inner action will at least have start/update/finish called on it.
// ----------------------------------------------------------------------------
function SkippableAction( actionToMaybeSkip )
{
	this.innerAction = actionToMaybeSkip;
}
SkippableAction.prototype = new BaseAction();

SkippableAction.prototype.start = function ()
{
	this.innerAction.start();
}
SkippableAction.prototype.update = function ()
{
	return this.innerAction.update() && !IsSkippingAhead();
}
SkippableAction.prototype.finish = function ()
{
	this.innerAction.finish();
}



// Action to rum multiple actions in parallel, but with a slight stagger start between each of them
function RunSkippableStaggeredActions( staggerSeconds )
{
	this.actions = [];
	this.staggerSeconds = staggerSeconds;
}
RunSkippableStaggeredActions.prototype = new BaseAction();
RunSkippableStaggeredActions.prototype.start = function ()
{
	this.par = new RunParallelActions();

	for ( var i = 0; i < this.actions.length; ++i )
	{
		var delay = i * this.staggerSeconds;
		if ( delay > 0 )
		{
			var seq = new RunSequentialActions();
			seq.actions.push( new SkippableAction( new WaitAction( delay ) ) );
			seq.actions.push( this.actions[i] );
			this.par.actions.push( seq );
		}
		else
		{
			this.par.actions.push( this.actions[i] );
		}
	}

	this.par.start();
}
RunSkippableStaggeredActions.prototype.update = function ()
{
	return this.par.update();
}
RunSkippableStaggeredActions.prototype.finish = function ()
{
	this.par.finish();
}


// ----------------------------------------------------------------------------
//   OptionalSkippableAction
// 
//   Wrap a OptionalSkippableAction around any other action to have it skip it
//   if requested. OptionalSkippableAction will skip the inner action entirely
//   if skipping is currently enabled. However, if it starts the inner action
//   at all, then it will guarantee at least a call to start/update/finish.
// ----------------------------------------------------------------------------
function OptionalSkippableAction( actionToMaybeSkip )
{
	this.innerAction = actionToMaybeSkip;
}
OptionalSkippableAction.prototype = new BaseAction();

OptionalSkippableAction.prototype.start = function ()
{
	this.innerActionStarted = false;

	if ( !IsSkippingAhead() )
	{
		this.innerAction.start();
		this.innerActionStarted = true;
	}
}
OptionalSkippableAction.prototype.update = function ()
{
	if ( this.innerActionStarted )
		return this.innerAction.update() && !IsSkippingAhead();

	if ( IsSkippingAhead() )
		return false;

	this.innerAction.start();
	this.innerActionStarted = true;

	return this.innerAction.update();
}
OptionalSkippableAction.prototype.finish = function ()
{
	if ( this.innerActionStarted )
	{
		this.innerAction.finish();
	}
}


// ----------------------------------------------------------------------------
//   Battle pass level progress bar
// ----------------------------------------------------------------------------

function AnimateBattlePassLevelsAction( panel, eventId, bpPointsStart, bpPointsPerLevel, bpPointsAdd )
{
    this.panel = panel;
    this.eventId = eventId;
    this.bpPointsStart = bpPointsStart;
    this.bpPointsPerLevel = bpPointsPerLevel;
    this.bpPointsAdd = bpPointsAdd;
    this.seq = new RunSequentialActions();

    var battlePointsStart = this.bpPointsStart;
    var battleLevelStart = Math.floor( battlePointsStart / this.bpPointsPerLevel );
    var battlePointsAtLevelStart = battleLevelStart * this.bpPointsPerLevel;
    var bpLevelStart = battlePointsStart - battlePointsAtLevelStart;
    var bpLevelNext = this.bpPointsPerLevel;

    panel.SetDialogVariableInt( 'current_level_bp', bpLevelStart );
    panel.SetDialogVariableInt( 'bp_to_next_level', bpLevelNext );
    panel.FindChildInLayoutFile( 'BattlePassLevelShield' ).SetEventLevel( this.eventId, battleLevelStart );

    var progressBar = panel.FindChildInLayoutFile( "BattleLevelProgress" );
    progressBar.max = bpLevelNext;
    progressBar.lowervalue = bpLevelStart;
    progressBar.uppervalue = bpLevelStart;

    var bpEarned = 0;
    var bpLevel = bpLevelStart;
    var battleLevel = battleLevelStart;

    var bpRemaining = this.bpPointsAdd;
    var bpEarnedOnRow = 0;

    while ( bpRemaining > 0 )
    {
        var bpToAnimate = 0;
        var bpToNextLevel = 0;
        bpToNextLevel = bpLevelNext - bpLevel;
        bpToAnimate = Math.min( bpRemaining, bpToNextLevel );

        if ( bpToAnimate > 0 )
        {
            this.seq.actions.push( new SkippableAction( new AnimateBattlePointsIncreaseAction( panel, bpToAnimate, bpEarnedOnRow, bpEarned, bpLevel ) ) );

            bpEarned += bpToAnimate;
            bpLevel += bpToAnimate;
            bpEarnedOnRow += bpToAnimate;
            bpRemaining -= bpToAnimate;
        }

        bpToNextLevel = bpLevelNext - bpLevel;

        if ( bpToNextLevel != 0 )
            continue;

        battleLevel = battleLevel + 1;
        bpLevel = 0;

        this.seq.actions.push( new AddClassAction( panel, 'LeveledUpStart' ) );

        ( function ( me, battleLevelInternal ) {
            me.seq.actions.push( new RunFunctionAction( function () {
                var levelShield = panel.FindChildInLayoutFile( 'BattlePassLevelShield' );
                levelShield.AddClass( 'LeveledUp' );
                levelShield.SetEventLevel( me.eventId, battleLevelInternal );
            } ) );
        } )( this, battleLevel );

        this.seq.actions.push( new RemoveClassAction( panel, 'LeveledUpStart' ) );
        this.seq.actions.push( new AddClassAction( panel, 'LeveledUpEnd' ) );
        this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );

        ( function ( me, battleLevelInternal ) {
            me.seq.actions.push( new RunFunctionAction( function () {
                var levelShield = panel.FindChildInLayoutFile( 'BattlePassLevelShield' );
                levelShield.RemoveClass( 'LeveledUp' );
            } ) );
        } )( this, battleLevel );
        this.seq.actions.push( new RemoveClassAction( panel, 'LeveledUpEnd' ) );

        ( function ( me, bpLevelInternal, bpLevelNextInternal ) {
            me.seq.actions.push( new RunFunctionAction( function () {
                progressBar.lowervalue = 0;
                progressBar.uppervalue = 0;
                panel.SetDialogVariableInt( 'current_level_bp', bpLevelInternal );
                panel.SetDialogVariableInt( 'bp_to_next_level', bpLevelNextInternal );
                panel.FindChildInLayoutFile( "BattleLevelProgress" ).max = bpLevelNextInternal;
                panel.FindChildInLayoutFile( "BattleLevelProgress" ).value = bpLevelInternal;
            } ) );
        } )( this, bpLevel, bpLevelNext );
    }
}

AnimateBattlePassLevelsAction.prototype = new BaseAction();
AnimateBattlePassLevelsAction.prototype.start = function () {
    return this.seq.start();
}
AnimateBattlePassLevelsAction.prototype.update = function () {
    return this.seq.update();
}
AnimateBattlePassLevelsAction.prototype.finish = function () {
    this.seq.finish();
}


// ----------------------------------------------------------------------------
//   Hero Badge Level Screen
// ----------------------------------------------------------------------------

// Keep in sync with EHeroBadgeXPType
const HERO_BADGE_XP_TYPE_MATCH_FINISHED = 0;
const HERO_BADGE_XP_TYPE_MATCH_WON = 1;
const HERO_BADGE_XP_TYPE_CHALLENGE_COMPLETED = 2;

// Keep in sync with EHeroBadgeLevelReward
const HERO_BADGE_LEVEL_REWARD_TIER = 0;
const HERO_BADGE_LEVEL_REWARD_CHAT_WHEEL = 1;
const HERO_BADGE_LEVEL_REWARD_CURRENCY = 2;

// Keep in sync with the version in dota_plus.h
const k_unMaxHeroRewardLevel = 25;

function GetXPIncreaseAnimationDuration( xpAmount )
{
	return RemapValClamped( xpAmount, 0, 500, 0.5, 1.0 );
}

// Action to animate a hero badge xp increase
function AnimateHeroBadgeXPIncreaseAction( panel, progress, xpAmount, xpValueStart, xpEarnedStart, xpLevelStart, resumeFromPreviousRow )
{
	this.panel = panel;
	this.progress = progress;
	this.xpAmount = xpAmount;
	this.xpValueStart = xpValueStart;
	this.xpEarnedStart = xpEarnedStart;
	this.xpLevelStart = xpLevelStart;
	this.resumeFromPreviousRow = resumeFromPreviousRow;
}
AnimateHeroBadgeXPIncreaseAction.prototype = new BaseAction();

AnimateHeroBadgeXPIncreaseAction.prototype.start = function ()
{
	var rowsContainer = this.panel.FindChildInLayoutFile( "HeroBadgeProgressRows" );
	var totalsRow = this.panel.FindChildInLayoutFile( "TotalsRow" );
	var row = null;

	this.seq = new RunSequentialActions();

	if ( this.resumeFromPreviousRow )
	{
		row = rowsContainer.GetChild( rowsContainer.GetChildCount() - 1 );
	}
	else
	{
		row = $.CreatePanel( 'Panel', rowsContainer, '' );

		if ( this.progress.xp_type == HERO_BADGE_XP_TYPE_MATCH_FINISHED )
		{
			row.BLoadLayoutSnippet( 'HeroBadgeProgressRow' );
			row.SetDialogVariable( 'xp_type', $.Localize( '#DOTA_PlusPostGame_MatchFinished' ) );
		}
		else if ( this.progress.xp_type == HERO_BADGE_XP_TYPE_MATCH_WON )
		{
			row.BLoadLayoutSnippet( 'HeroBadgeProgressRow' );
			row.SetDialogVariable( 'xp_type', $.Localize( '#DOTA_PlusPostGame_Win' ) );
		}
		else if ( this.progress.xp_type == HERO_BADGE_XP_TYPE_CHALLENGE_COMPLETED )
		{
			row.BLoadLayoutSnippet( 'HeroBadgeProgressRow_Challenge' );
			row.SetDialogVariable( 'xp_type', $.Localize( '#DOTA_PlusPostGame_ChallengeCompleted' ) );
			row.SetDialogVariable( 'challenge_name', this.progress.challenge_description );
			row.SwitchClass( 'challenge_stars', "StarsEarned_" + this.progress.challenge_stars );
		}
		else
		{
			$.Msg( "Unknown XP type: " + this.progress.xp_type );
			row.BLoadLayoutSnippet( 'HeroBadgeProgressRow' );
			row.SetDialogVariable( 'xp_type', this.progress.xp_type );
		}

		row.SetDialogVariableInt( 'xp_value', this.xpValueStart );

		this.seq.actions.push( new AddClassAction( row, 'ShowRow' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
		this.seq.actions.push( new AddClassAction( row, 'ShowValue' ) );
	}

	var duration = GetXPIncreaseAnimationDuration( this.xpAmount );
	var levelProgressBar = this.panel.FindChildInLayoutFile( 'HeroBadgeLevelProgress' );
	var minLevelXP = Math.min( this.xpLevelStart, levelProgressBar.max );
	var maxLevelXP = Math.min( this.xpLevelStart + this.xpAmount, levelProgressBar.max );
	var par = new RunParallelActions();
	par.actions.push( new AnimateDialogVariableIntAction( row, 'xp_value', this.xpValueStart, this.xpValueStart + this.xpAmount, duration ) );
	par.actions.push( new AnimateDialogVariableIntAction( totalsRow, 'xp_value', this.xpEarnedStart, this.xpEarnedStart + this.xpAmount, duration ) );
	par.actions.push( new AnimateDialogVariableIntAction( this.panel, 'current_level_xp', minLevelXP, maxLevelXP, duration ) );
	par.actions.push( new AnimateProgressBarAction( levelProgressBar, minLevelXP, maxLevelXP, duration ) );
	par.actions.push( new PlaySoundForDurationAction( "XP.Count", duration ) );
	this.seq.actions.push( par );

	this.seq.start();
}
AnimateHeroBadgeXPIncreaseAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateHeroBadgeXPIncreaseAction.prototype.finish = function ()
{
	this.seq.finish();
}


// Action to display victory prediction shards
function AnimateShardRewardAction( panel, label, shardAmount )
{
	this.panel = panel;
	this.label = label;
	this.shardAmount = shardAmount;

}
AnimateShardRewardAction.prototype = new BaseAction();

AnimateShardRewardAction.prototype.start = function ()
{
	var rowsContainer = this.panel.FindChildInLayoutFile( "HeroBadgeProgressRows" );
	var row = null;

	this.seq = new RunSequentialActions();

	row = $.CreatePanel( 'Panel', this.panel.FindChildInLayoutFile( "HeroBadgeProgressCenter" ), '' );
	row.BLoadLayoutSnippet( 'HeroBadgeProgressRow_ShardReward' );
	row.SetDialogVariable( 'reward_type', $.Localize( this.label ) );
	row.SetDialogVariableInt( 'shard_value', 0 );
	this.seq.actions.push( new AddClassAction( row, 'ShowRow' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
	this.seq.actions.push( new AddClassAction( row, 'ShowValue' ) );
	var duration = GetXPIncreaseAnimationDuration( this.shardAmount ) * 2;
	var par = new RunParallelActions();
	par.actions.push( new AnimateDialogVariableIntAction( row, 'shard_value', 0, this.shardAmount, duration ) );
	par.actions.push( new PlaySoundForDurationAction( "XP.Count", duration ) );
	this.seq.actions.push( par );
	this.seq.start();
}
AnimateShardRewardAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateShardRewardAction.prototype.finish = function ()
{
	this.seq.finish();
}


function AnimateHeroBadgeLevelRewardAction( data, containerPanel )
{
	this.data = data;
	this.containerPanel = containerPanel;
}
AnimateHeroBadgeLevelRewardAction.prototype = new BaseAction();
AnimateHeroBadgeLevelRewardAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();

	if ( this.data.reward_type == HERO_BADGE_LEVEL_REWARD_TIER )
	{
		var reward = $.CreatePanel( 'Panel', this.containerPanel, '' );
		reward.BLoadLayoutSnippet( 'HeroBadgeLevelUpRewardTier' );
		reward.AddClass( this.data.tier_class );
		reward.SetDialogVariable( "tier_name", $.Localize( this.data.tier_name ) );
		this.seq.actions.push( new AddClassAction( reward, 'ShowReward' ) );
	}
	else if ( this.data.reward_type == HERO_BADGE_LEVEL_REWARD_CHAT_WHEEL )
	{
		var reward = $.CreatePanel( 'Panel', this.containerPanel, '' );
		reward.BLoadLayoutSnippet( 'HeroBadgeLevelUpRewardChatWheel' );
		reward.SetDialogVariable( "all_chat_prefix", this.data.all_chat ? $.Localize( '#dota_all_chat_label_prefix' ) : "" );
		reward.SetDialogVariable( "chat_wheel_message", $.Localize( this.data.chat_wheel_message ) );
		var sound_event = this.data.sound_event;
		$.RegisterEventHandler( "Activated", reward, function ()
		{			
			PlayUISoundScript( sound_event );
		} );
		this.seq.actions.push( new AddClassAction( reward, 'ShowReward' ) );
	}
	else if ( this.data.reward_type == HERO_BADGE_LEVEL_REWARD_CURRENCY )
	{
		var reward = $.CreatePanel( 'Panel', this.containerPanel, '' );
		reward.BLoadLayoutSnippet( 'HeroBadgeLevelUpRewardCurrency' );
		reward.SetDialogVariableInt( "currency_amount", this.data.currency_amount );
		this.seq.actions.push( new AddClassAction( reward, 'ShowReward' ) );
	}
	else
	{
		$.Msg( "Unknown reward_type '" + this.data.reward_type + "', skipping" );
	}

	this.seq.actions.push( new WaitAction( 1.0 ) );

	this.seq.start();
}
AnimateHeroBadgeLevelRewardAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateHeroBadgeLevelRewardAction.prototype.finish = function ()
{
	this.seq.finish();
}


function AnimateHeroRelicProgressAction( data, containerPanel )
{
	this.data = data;
	this.containerPanel = containerPanel;
}
AnimateHeroRelicProgressAction.prototype = new BaseAction();
AnimateHeroRelicProgressAction.prototype.start = function ()
{
	this.panel = $.CreatePanel( 'Panel', this.containerPanel, '' );
	this.panel.BLoadLayoutSnippet( 'SingleRelicProgress' );
	this.panel.SetDialogVariableInt( 'relic_type', this.data.relic_type );
	this.panel.SetDialogVariableInt( 'current_progress', this.data.starting_value );
	this.panel.SetDialogVariableInt( 'increment', this.data.ending_value - this.data.starting_value );

	var relicImage = this.panel.FindChildInLayoutFile( "SingleRelicImage" );
	relicImage.SetRelic( this.data.relic_type, this.data.relic_rarity, this.data.primary_attribute, false );

	this.seq = new RunSequentialActions();

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowProgress' ) );
	this.seq.actions.push( new WaitAction( 0.2 ) );
	this.seq.actions.push( new AddClassAction( this.panel, 'ShowIncrement' ) );
	this.seq.actions.push( new WaitAction( 0.4 ) );


	return this.seq.start();
}
AnimateHeroRelicProgressAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateHeroRelicProgressAction.prototype.finish = function ()
{
	this.seq.finish();
}


function AnimateHeroBadgeLevelScreenAction( data )
{
	this.data = data;
}

AnimateHeroBadgeLevelScreenAction.prototype = new BaseAction();
AnimateHeroBadgeLevelScreenAction.prototype.start = function ()
{
	var xpHeroStart = this.data.hero_badge_xp_start;
	var heroLevelStart = $.GetContextPanel().GetHeroBadgeLevelForHeroXP( xpHeroStart );
	var heroID = this.data.hero_id;

	var xpTotalLevelStart = $.GetContextPanel().GetTotalHeroXPRequiredForHeroBadgeLevel( heroLevelStart );

	var xpLevelStart = 0;
	var xpLevelNext = 0;
	if ( heroLevelStart < k_unMaxHeroRewardLevel )
	{
		xpLevelStart = xpHeroStart - xpTotalLevelStart;
		xpLevelNext = $.GetContextPanel().GetHeroXPForNextHeroBadgeLevel( heroLevelStart );
	}
	else
	{
		xpLevelNext = $.GetContextPanel().GetHeroXPForNextHeroBadgeLevel( k_unMaxHeroRewardLevel - 1 );
		xpLevelStart = xpLevelNext;
	}

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'HeroBadgeProgressScreen' );
	panel.BLoadLayoutSnippet( "HeroBadgeProgress" );
	panel.FindChildInLayoutFile( "HeroBadgeProgressHeroBadge" ).herolevel = heroLevelStart;

	panel.FindChildInLayoutFile( "TotalsRow" ).SetDialogVariableInt( 'xp_value', 0 );
	panel.SetDialogVariableInt( 'current_level_xp', xpLevelStart );
	panel.SetDialogVariableInt( 'xp_to_next_level', xpLevelNext );
	panel.SetDialogVariableInt( 'current_level', heroLevelStart );

	panel.FindChildInLayoutFile( "HeroBadgeLevelProgress" ).max = xpLevelNext;
	panel.FindChildInLayoutFile( "HeroBadgeLevelProgress" ).value = xpLevelStart;

	var heroModel = panel.FindChildInLayoutFile( 'HeroBadgeHeroModel' );
	if ( typeof this.data.player_slot !== 'undefined' )
	{
		// Use this normally when viewing the details
		heroModel.SetScenePanelToPlayerHero( this.data.match_id, this.data.player_slot );
	}
	else
	{
		// Use this for testing when we don't actually have match data
		heroModel.SetScenePanelToLocalHero( this.data.hero_id );
	}

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new ActionWithTimeout( new WaitForClassAction( heroModel, 'SceneLoaded' ), 3.0 ) );
	this.seq.actions.push( new WaitAction( 0.5 ) );

	if ( this.data.hero_badge_progress )
	{
		this.seq.actions.push( new AddScreenLinkAction( panel, 'HeroBadgeProgress', '#DOTA_PlusPostGame_HeroProgress', function ()
		{
			panel.SwitchClass( 'current_screen', 'ShowHeroProgress' );
		} ) );

		this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', 'ShowHeroProgress' ) );

		var xpEarned = 0;
		var xpLevel = xpLevelStart;
		var heroLevel = heroLevelStart;
		for ( var i = 0; i < this.data.hero_badge_progress.length; ++i )
		{
			var xpRemaining = this.data.hero_badge_progress[i].xp_amount;
			var xpEarnedOnRow = 0;

			while ( xpRemaining > 0 )
			{
				var xpToAnimate = 0;
				var xpToNextLevel = 0;
				if ( heroLevel >= k_unMaxHeroRewardLevel )
				{
					xpToAnimate = xpRemaining;
				}
				else
				{
					xpToNextLevel = xpLevelNext - xpLevel;
					xpToAnimate = Math.min( xpRemaining, xpToNextLevel );
				}

				if ( xpToAnimate > 0 )
				{
					this.seq.actions.push( new SkippableAction( new AnimateHeroBadgeXPIncreaseAction( panel, this.data.hero_badge_progress[i], xpToAnimate, xpEarnedOnRow, xpEarned, xpLevel, xpEarnedOnRow != 0 ) ) );

					xpEarned += xpToAnimate;
					xpLevel += xpToAnimate;
					xpEarnedOnRow += xpToAnimate;
					xpRemaining -= xpToAnimate;
				}

				xpToNextLevel = xpLevelNext - xpLevel;
				if ( xpToNextLevel == 0 && heroLevel < k_unMaxHeroRewardLevel )
				{
					heroLevel = heroLevel + 1;

					this.seq.actions.push( new StopSkippingAheadAction() );

					( function ( me, heroLevel )
					{
						me.seq.actions.push( new RunFunctionAction( function ()
						{
							panel.AddClass( "LeveledUp" );
							panel.SetDialogVariableInt( 'current_level', heroLevel );
						} ) );

						var levelUpData = me.data.hero_badge_level_up[ heroLevel ];
						if ( levelUpData )
						{
							var levelUpScene = panel.FindChildInLayoutFile( 'LevelUpRankScene' );

							me.seq.actions.push( new ActionWithTimeout( new WaitForClassAction( levelUpScene, 'SceneLoaded' ), 3.0 ) );

							var rewardsPanel = panel.FindChildInLayoutFile( "HeroBadgeProgressRewardsList" );

							me.seq.actions.push( new RunFunctionAction( function ()
							{
								rewardsPanel.RemoveAndDeleteChildren();
								panel.RemoveClass( 'RewardsFinished' );

								PlayUISoundScript( "HeroBadge.Levelup" );
								$.DispatchEvent( 'DOTASceneFireEntityInput', levelUpScene, 'light_rank_' + levelUpData.tier_number, 'TurnOn', '1' );
								$.DispatchEvent( 'DOTASceneFireEntityInput', levelUpScene, 'particle_rank_' + levelUpData.tier_number, 'start', '1' );
							} ) );

							me.seq.actions.push( new SkippableAction( new WaitAction( 4.0 ) ) );

							for ( var j = 0; j < levelUpData.rewards.length; ++j )
							{
								me.seq.actions.push( new SkippableAction( new AnimateHeroBadgeLevelRewardAction( levelUpData.rewards[j], rewardsPanel ) ) );
							}

							me.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
							me.seq.actions.push( new AddClassAction( panel, 'RewardsFinished' ) );
							me.seq.actions.push( new WaitForEventAction( panel.FindChildInLayoutFile( "RewardsFinishedButton" ), 'Activated' ) );
							me.seq.actions.push( new StopSkippingAheadAction() );

							me.seq.actions.push( new RunFunctionAction( function ()
							{
								$.DispatchEvent( 'DOTASceneFireEntityInput', levelUpScene, 'light_rank_' + levelUpData.tier_number, 'TurnOff', '1' );
								$.DispatchEvent( 'DOTASceneFireEntityInput', levelUpScene, 'particle_rank_' + levelUpData.tier_number, 'DestroyImmediately', '1' );
							} ) );
						}

						me.seq.actions.push( new RunFunctionAction( function ()
						{
							panel.RemoveClass( 'LeveledUp' );
							panel.FindChildInLayoutFile( "HeroBadgeProgressHeroBadge" ).herolevel = heroLevel;
						} ) );

					} )( this, heroLevel );
					
					this.seq.actions.push( new WaitAction( 1.0 ) );

					if ( heroLevel >= k_unMaxHeroRewardLevel )
					{
						xpLevel = xpLevelNext;
					}
					else
					{
						xpLevel = 0;
						xpLevelNext = $.GetContextPanel().GetHeroXPForNextHeroBadgeLevel( heroLevel );
					}

					( function ( me, xpLevelInternal, xpLevelNextInternal )
					{
						me.seq.actions.push( new RunFunctionAction( function ()
						{
							panel.SetDialogVariableInt( 'current_level_xp', xpLevelInternal );
							panel.SetDialogVariableInt( 'xp_to_next_level', xpLevelNextInternal );
							panel.FindChildInLayoutFile( "HeroBadgeLevelProgress" ).max = xpLevelNextInternal;
							panel.FindChildInLayoutFile( "HeroBadgeLevelProgress" ).value = xpLevelInternal;
						} ) );
					} )( this, xpLevel, xpLevelNext );
					
				}
			}

			this.seq.actions.push( new WaitAction( 0.2 ) );
		}

		if ( this.data.dota_plus_progress !== undefined )
		{
			if ( this.data.dota_plus_progress.tips !== undefined && this.data.dota_plus_progress.tips.length != 0 )
			{
				var nShardTips = 0;
				for ( var i = 0; i < this.data.dota_plus_progress.tips.length; ++i )
				{
					nShardTips += this.data.dota_plus_progress.tips[i].amount;
				}
				this.seq.actions.push( new AnimateShardRewardAction( panel, '#DOTA_PlusPostGame_PlayerTips', nShardTips ) );
			}

			if ( this.data.dota_plus_progress.victory_prediction_shard_reward > 0 )
			{
				this.seq.actions.push( new AnimateShardRewardAction( panel, '#DOTA_PlusPostGame_VictoryPrediction', this.data.dota_plus_progress.victory_prediction_shard_reward ) );
			}

			if ( this.data.dota_plus_progress.cavern_crawl !== undefined )
			{
				this.seq.actions.push( new AnimateShardRewardAction( panel, '#DOTA_PlusPostGame_CavernCrawlProgress', this.data.dota_plus_progress.cavern_crawl.shard_amount ) );
			}

			if ( this.data.dota_plus_progress.role_call_shard_reward > 0 )
			{
			    this.seq.actions.push( new AnimateShardRewardAction( panel, '#DOTA_PlusPostGame_RoleCallProgress', this.data.dota_plus_progress.role_call_shard_reward ) );
			}
		}

		this.seq.actions.push( new StopSkippingAheadAction() );
		this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );
		this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
	}

	// Now animate the relics
	if ( this.data.hero_relics_progress )
	{
		if ( this.data.hero_relics_progress.length > 0 )
		{
			this.seq.actions.push( new StopSkippingAheadAction() );
			this.seq.actions.push( new AddScreenLinkAction( panel, 'HeroRelicsProgress', '#DOTA_PlusPostGame_RelicsProgress', function ()
			{
				panel.SwitchClass( 'current_screen', 'ShowRelicsProgress' );
			} ) );

			this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', 'ShowRelicsProgress' ) );
			this.seq.actions.push( new WaitAction( 0.5 ) );
			var stagger = new RunStaggeredActions( 0.15 );
			this.seq.actions.push( new SkippableAction( stagger ));
			var relicsList = panel.FindChildInLayoutFile( "HeroRelicsProgressList" );
			for ( var i = 0; i < this.data.hero_relics_progress.length; ++i )
			{
				stagger.actions.push( new AnimateHeroRelicProgressAction( this.data.hero_relics_progress[i], relicsList ) )
			}

			this.seq.actions.push( new StopSkippingAheadAction() );
			this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );
			this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
			this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
		}
	}

	this.seq.start();
}
AnimateHeroBadgeLevelScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateHeroBadgeLevelScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}

// ----------------------------------------------------------------------------
//
// Cavern Crawl Screen
//
// ----------------------------------------------------------------------------

function AnimateCavernCrawlScreenAction( data )
{
	this.data = data;
}

AnimateCavernCrawlScreenAction.prototype = new BaseAction();

AnimateCavernCrawlScreenAction.prototype.start = function ()
{
    var heroID = this.data.hero_id;
    var eventID = this.data.cavern_crawl_progress.event_id;
    var mapVariant = this.data.cavern_crawl_progress.map_variant;
	var turboMode = this.data.cavern_crawl_progress.turbo_mode;
	var mapProgress = this.data.cavern_crawl_progress.map_progress;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'CavernCrawlProgressScreen' );
	panel.BLoadLayoutSnippet( "CavernCrawlProgress" );

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
    this.eventHandler = null;

    ( function (me) 
    {
        me.seq.actions.push( new RunFunctionAction( function ()
        {
            var hHandler = (function (me2)
            {
                return function ()
                {
                    if ( !me2.disabled_update )
                    {
                        me2.disabled_update = true;
                        me2.cavern_panel.DisableUpdateDisplay(true);
                    }
                };
            }(me));

            me.eventHandler = $.RegisterForUnhandledEvent("PostGameProgressSkippingAhead", hHandler);
        }));
    })(this);

	this.seq.actions.push( new AddScreenLinkAction( panel, 'CavernsProgress', '#DOTACavernCrawl_Title_TI2020' ) );

	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );

    var cavernCrawlPanel = panel.FindChildInLayoutFile('CavernCrawl');

	this.seq.actions.push( new AddClassAction( panel, 'ShowCavernCrawlProgress' ) );
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		cavernCrawlPanel.ClearMapResults();
		if ( mapProgress )
		{
			for ( var i = 0; i < mapProgress.length; ++i )
			{
				var result = mapProgress[i]
				cavernCrawlPanel.AddMapResult( result.path_id_completed, result.room_id_claimed );
			}
		}
        cavernCrawlPanel.ShowPostGameProgress( eventID, 0, mapVariant, heroID, turboMode );
	} ) );
	this.seq.actions.push( new WaitForEventAction( cavernCrawlPanel, 'DOTACavernCrawlPostGameProgressComplete' ) );
	this.seq.actions.push( new StopSkippingAheadAction() );

	this.seq.start();

	this.cavern_panel = panel.FindChildInLayoutFile( "CavernCrawl" );
}

AnimateCavernCrawlScreenAction.prototype.update = function ()
{
	return this.seq.update();
}

AnimateCavernCrawlScreenAction.prototype.finish = function ()
{
    if ( this.eventHandler != null )
    {
        $.UnregisterForUnhandledEvent("PostGameProgressSkippingAhead", this.eventHandler);
        this.eventHandler = null;
    }

	if ( this.disabled_update )
	{
        this.cavern_panel.DisableUpdateDisplay(false);
        this.disabled_update = false;
	}
	this.seq.finish();
}

// ----------------------------------------------------------------------------
//
// Battle Points
//
// ----------------------------------------------------------------------------


//-----------------------------------------------------------------------------
// Animates battle points within a single level
//-----------------------------------------------------------------------------
function GetBPIncreaseAnimationDuration( bpAmount )
{
	return RemapValClamped( bpAmount, 0, 500, 0.2, 0.6 );
}


// Action to animate a battle pass bp increase
function AnimateBattlePointsIncreaseAction( panel, bpAmount, bpValueStart, bpEarnedStart, bpLevelStart )
{
	this.panel = panel;
	this.bpAmount = bpAmount;
	this.bpValueStart = bpValueStart;
	this.bpEarnedStart = bpEarnedStart;
	this.bpLevelStart = bpLevelStart;
}
AnimateBattlePointsIncreaseAction.prototype = new BaseAction();

AnimateBattlePointsIncreaseAction.prototype.start = function ()
{
	this.seq = new RunParallelActions();

	var duration = GetBPIncreaseAnimationDuration( this.bpAmount );
	var levelProgressBar = this.panel.FindChildInLayoutFile( 'BattleLevelProgress' );
	var minLevelBP = Math.min( this.bpLevelStart, levelProgressBar.max );
	var maxLevelBP = Math.min( this.bpLevelStart + this.bpAmount, levelProgressBar.max );

	this.seq.actions.push( new AnimateDialogVariableIntAction( this.panel, 'current_level_bp', minLevelBP, maxLevelBP, duration ) );
	this.seq.actions.push( new AnimateProgressBarWithMiddleAction( levelProgressBar, minLevelBP, maxLevelBP, duration ) );
	this.seq.actions.push( new PlaySoundForDurationAction( "XP.Count", duration ) );

	this.seq.start();
}
AnimateBattlePointsIncreaseAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateBattlePointsIncreaseAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Adds points to totals bar
//-----------------------------------------------------------------------------
function UpdateSubpanelTotalPoints( panel, ownerPanel, bpAmount, bpStartingSubTotal, displayOnly )
{
	panel.SetDialogVariableInt( 'xp_circle_points', bpAmount );
	panel.AddClass( 'ShowTotals' );
	if ( !displayOnly )
	{
		ownerPanel.SetDialogVariableInt( 'total_points_gained', bpStartingSubTotal + bpAmount );
	}
}


//-----------------------------------------------------------------------------
// Subpanel animation timings
//-----------------------------------------------------------------------------
var g_DelayAfterStart = 0.05;
var g_SubElementDelay = 0.05;

//-----------------------------------------------------------------------------
// Animates wagering subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateWageringSubpanelAction( panel, ownerPanel, wagering_data, startingPoints )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;

	panel.AddClass( 'Visible' );

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );

	panel.SetDialogVariableInt( 'wager_amount', wagering_data.wager_amount );
	panel.SetDialogVariableInt( 'wager_conversion_ratio', wagering_data.conversion_ratio );
	panel.SetDialogVariableInt( 'wager_token_bonus_pct', wagering_data.wager_token_bonus_pct );
	panel.SetDialogVariableInt( 'wager_streak_bonus_pct', wagering_data.wager_streak_bonus_pct );

	this.total_points = wagering_data.wager_amount * wagering_data.conversion_ratio * ( 100 + wagering_data.wager_streak_bonus_pct + wagering_data.wager_token_bonus_pct ) / 100;
}

AnimateWageringSubpanelAction.prototype = new BaseAction();

AnimateWageringSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowWager' ) );
	this.seq.actions.push( new AddClassAction( this.panel, 'ShowTeamWagerBonus' ) );

	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.total_points;
	var startingPoints = this.startingPoints;
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, false );
	} ) );

	this.seq.start();
}
AnimateWageringSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateWageringSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Animates tipping subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateTippingSubpanelAction( panel, ownerPanel, tips, startingPoints )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;

	panel.AddClass( 'Visible' );

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );

	var totalTipCount = 0;
	this.panelCount = 0;
	this.total_points = 0;

	var tipContainer = panel.FindChildInLayoutFile( "TipContainer" );
	var tipContainer2 = panel.FindChildInLayoutFile( "TipContainer2" );
	var tipParent = tipContainer;
	for ( var i = 0; i < tips.length; ++i )
	{
		if ( i == 4 )
		{
			tipParent = tipContainer2;
			panel.AddClass( "TwoTipColumns" );
		}

		var tipperPanel = $.CreatePanel( 'Panel', tipParent, 'Tipper' + i );
		tipperPanel.BLoadLayoutSnippet( 'BattlePassTip' );

		var avatarPanel = tipperPanel.FindChildInLayoutFile( "Avatar" );
		avatarPanel.SetAccountID( tips[i].account_id );

		tipperPanel.SetDialogVariableInt( 'tip_points', tips[i].amount );
		tipperPanel.AddClass( 'TipCount' + tips[i].count );

		totalTipCount += tips[i].count;
		this.panelCount = this.panelCount + 1;
		this.total_points += tips[i].count * tips[i].amount
	}
	panel.SetDialogVariableInt( 'total_tip_count', totalTipCount );
}

AnimateTippingSubpanelAction.prototype = new BaseAction();

AnimateTippingSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowTotalTips' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	for ( var i = 0; i < this.panelCount; ++i )
	{
		var tipperPanel = this.panel.FindChildInLayoutFile( 'Tipper' + i );
		this.seq.actions.push( new AddClassAction( tipperPanel, 'ShowTip' ) );
	}

	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.total_points;
	var startingPoints = this.startingPoints;
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, false );
	} ) );

	this.seq.start();
}

AnimateTippingSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}

AnimateTippingSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Animates actions granted subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateActionsGrantedSubpanelAction( panel, ownerPanel, actions_granted, startingPoints )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;

	panel.AddClass( 'Visible' );

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );

	this.panelCount = 0;
	this.total_points = 0;

	var actionContainer = panel.FindChildInLayoutFile( "ActionContainer" );
	for ( var i = 0; i < actions_granted.length; ++i )
	{
		var actionPanel = $.CreatePanel( 'Panel', actionContainer, 'Action' + i );
		actionPanel.BLoadLayoutSnippet( 'BattlePassAction' );

		if ( actions_granted[i].action_image != null )
		{
			var imagePanel = actionPanel.FindChildInLayoutFile( "ConsumableImage" );
			imagePanel.SetImage( actions_granted[i].action_image );
		}

		actionPanel.SetDialogVariableInt( 'action_points', actions_granted[i].bp_amount );
		actionPanel.SetDialogVariableInt( 'action_quantity', actions_granted[i].quantity );

		this.panelCount = this.panelCount + 1;
		this.total_points += actions_granted[i].quantity * actions_granted[i].bp_amount
	}
}

AnimateActionsGrantedSubpanelAction.prototype = new BaseAction();

AnimateActionsGrantedSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowTotalActions' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	for ( var i = 0; i < this.panelCount; ++i )
	{
		var actionPanel = this.panel.FindChildInLayoutFile( 'Action' + i );
		this.seq.actions.push( new AddClassAction( actionPanel, 'ShowAction' ) );
	}

	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.total_points;
	var startingPoints = this.startingPoints;
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, false );
	} ) );

	this.seq.start();
}

AnimateActionsGrantedSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}

AnimateActionsGrantedSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Animates cavern crawl subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateCavernCrawlSubpanelAction( panel, ownerPanel, cavern_data, startingPoints )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;

	panel.AddClass( 'Visible' );

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );

	panel.FindChildInLayoutFile( "CavernCrawlHero" ).heroid = cavern_data.hero_id;

	this.total_points = cavern_data.bp_amount;
}

AnimateCavernCrawlSubpanelAction.prototype = new BaseAction();

AnimateCavernCrawlSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowMap' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowCompleted' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.total_points;
	var startingPoints = this.startingPoints;
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, false );
	} ) );

	this.seq.start();
}
AnimateCavernCrawlSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateCavernCrawlSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Event game bp progress
//-----------------------------------------------------------------------------
function AnimateEventGameSubpanelAction( panel, ownerPanel, event_game, startingPoints ) {
    var kWinPointsBase = 300;

    this.panel = panel;
    this.ownerPanel = ownerPanel;
    this.startingPoints = startingPoints;
    this.total_points = event_game.bp_amount;
    this.show_win = ( event_game.win_points > 0 );
    this.show_loss = ( event_game.loss_points > 0 );
    this.show_daily_bonus = ( event_game.win_points > kWinPointsBase );
    this.show_treasure = ( event_game.treasure_points > 0 );

    panel.AddClass( 'Visible' );

    if ( this.show_win )
    {
        panel.AddClass( "EventGame_HasWin" );
    }

    if ( this.show_loss )
    {
        panel.AddClass( "EventGame_HasLoss" );
    }

    if ( this.show_daily_bonus )
    {
        panel.AddClass( "EventGame_HasDailyBonus" );
    }

    if ( this.show_treasure )
    {
        panel.AddClass( "EventGame_HasTreasure" );
    }

    var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
    panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );

    panel.SetDialogVariableInt( "win_points", event_game.win_points > kWinPointsBase ? kWinPointsBase : event_game.win_points );
    panel.SetDialogVariableInt( "bonus_points", event_game.win_points - kWinPointsBase );
	panel.SetDialogVariableInt( "loss_points",  event_game.loss_points );
    panel.SetDialogVariableInt( "treasure_points", event_game.treasure_points );

    var progressMax = event_game.weekly_cap_total;
    var progressEnd = progressMax - event_game.weekly_cap_remaining;
    var progressStart = progressEnd - event_game.bp_amount;

    panel.SetDialogVariableInt( "weekly_progress", progressEnd );
    panel.SetDialogVariableInt( "weekly_complete_limit", progressMax );

    var progressBar = panel.FindChildInLayoutFile( "EventGameWeeklyProgress" );
    progressBar.max = progressMax;
    progressBar.lowervalue = progressStart;
    progressBar.uppervalue = progressEnd;

}

AnimateEventGameSubpanelAction.prototype = new BaseAction();

AnimateEventGameSubpanelAction.prototype.start = function () {
    this.seq = new RunSequentialActions();
    this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
    this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

    if ( this.show_win )
    {
        this.seq.actions.push( new AddClassAction( this.panel, 'EventGame_ShowWin' ) );
        this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

        if ( this.show_daily_bonus )
        {
            this.seq.actions.push( new AddClassAction( this.panel, 'EventGame_ShowDailyBonus' ) );
            this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
        }
    }

	if ( this.show_loss )
    {
        this.seq.actions.push( new AddClassAction( this.panel, 'EventGame_ShowLoss' ) );
        this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
    }

    if ( this.show_treasure )
    {
        this.seq.actions.push( new AddClassAction( this.panel, 'EventGame_ShowTreasure' ) );
        this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
    }

    this.seq.actions.push( new AddClassAction( this.panel, 'EventGame_ShowWeeklyProgress' ) );
    this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

    var panel = this.panel;
    var ownerPanel = this.ownerPanel;
    var total_points = this.total_points;
    var startingPoints = this.startingPoints;
    this.seq.actions.push( new RunFunctionAction( function () {
        UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, false );
    } ) );

    this.seq.start();
}
AnimateEventGameSubpanelAction.prototype.update = function () {
    return this.seq.update();
}
AnimateEventGameSubpanelAction.prototype.finish = function () {
    this.seq.finish();
}


//-----------------------------------------------------------------------------
// Animates daily challenge subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateDailyChallengeSubpanelAction( panel, ownerPanel, daily_challenge, startingPoints )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;

	panel.AddClass( 'Visible' );

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );

	panel.FindChildInLayoutFile( "DailyChallengeHeroMovie" ).heroid = daily_challenge.hero_id;

	this.total_points = daily_challenge.bp_amount;
}

AnimateDailyChallengeSubpanelAction.prototype = new BaseAction();

AnimateDailyChallengeSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowHero' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowCompleted' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.total_points;
	var startingPoints = this.startingPoints;
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, false );
	} ) );

	this.seq.start();
}
AnimateDailyChallengeSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateDailyChallengeSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Animates weekly challenge subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateWeeklyChallengeSubpanelAction( panel, ownerPanel, weekly_challenge, startingPoints )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;

	panel.AddClass( 'Visible' );

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );
	panelXPCircle.SetDialogVariableInt( 'points', 1000 ); // Not sure why this is necesssary, we used to do this?

	panel.SetDialogVariable( 'weekly_challenge_description', weekly_challenge.challenge_description );
	panel.SetDialogVariableInt( 'weekly_progress', weekly_challenge.progress );
	panel.SetDialogVariableInt( 'weekly_complete_limit', weekly_challenge.complete_limit );
	panel.SetDialogVariableInt( 'weekly_increment', weekly_challenge.end_progress - weekly_challenge.progress );

	var progressBar = panel.FindChildInLayoutFile( "WeeklyChallengeProgress" );
	progressBar.max = weekly_challenge.complete_limit;
	progressBar.lowervalue = weekly_challenge.progress;
	progressBar.uppervalue = weekly_challenge.end_progress;

	this.points_for_display = weekly_challenge.bp_amount;
	this.total_points = 0;
	if ( weekly_challenge.end_progress == weekly_challenge.complete_limit )
	{
		this.total_points = weekly_challenge.bp_amount;
	}
	else
	{
		panel.AddClass( "HideXPCircle" );
	}
}

AnimateWeeklyChallengeSubpanelAction.prototype = new BaseAction();

AnimateWeeklyChallengeSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	this.seq.actions.push( new AddClassAction( this.panel, 'ShowChallenge' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );

	if ( this.total_points != 0 )
	{
		this.seq.actions.push( new AddClassAction( this.panel, 'ShowCompleted' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
	}

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.points_for_display;
	var displayOnly = ( this.total_points == 0 );
	var startingPoints = this.startingPoints;

	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, displayOnly );
	} ) );

	this.seq.start();
}
AnimateWeeklyChallengeSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateWeeklyChallengeSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}

//-----------------------------------------------------------------------------
// Animates Guild subpanel
//-----------------------------------------------------------------------------
// Action to animate a battle pass bp increase
function AnimateGuildSubpanelAction( panel, ownerPanel, guild_progress, startingPoints, event_id )
{
	this.panel = panel;
	this.ownerPanel = ownerPanel;
	this.startingPoints = startingPoints;
	this.total_points = 0;
	this.guild_progress = guild_progress;

	panel.AddClass( 'Visible' );

	if ( guild_progress.guild_contracts != null && guild_progress.guild_contracts.length > 0 )
	{
		var contractsList = panel.FindChildInLayoutFile( "GuildContractList" );
		for ( var i = 0; i < guild_progress.guild_contracts.length; ++i )
		{
			var guildContract = guild_progress.guild_contracts[i];

			var contractPanel = $.CreatePanel( 'Panel', contractsList, '' );
			contractPanel.BLoadLayoutSnippet( 'BattlePassGuildContract' );
			var contract = contractPanel.FindChildInLayoutFile( 'GuildContract' );
			contract.SetContract( event_id, guildContract.challenge_instance_id, guildContract.challenge_parameter, guildContract.completed );
			contractPanel.SetHasClass( "ContractCompleted", guildContract.completed );
			if (guildContract.completed )
				this.total_points += guildContract.battle_point_reward;
		}

		panel.AddClass( "HasGuildContracts" );
	}

	if ( guild_progress.guild_challenge != null )
	{
		var guildChallenge = guild_progress.guild_challenge;

		var challengeImage = panel.FindChildInLayoutFile( "GuildChallengeImage" );
		challengeImage.SetImage( guildChallenge.challenge_image );

		panel.SetDialogVariableInt( "challenge_start_value", guildChallenge.challenge_start_value );
		panel.SetDialogVariableInt( "challenge_max_value", guildChallenge.challenge_max_value );
		panel.SetDialogVariableInt( "challenge_progress", guildChallenge.challenge_progress );

		var challengeProgressBar = panel.FindChildInLayoutFile( "GuildChallengeProgressBar" );
		challengeProgressBar.min = 0;
		challengeProgressBar.max = guildChallenge.challenge_max_value;
		challengeProgressBar.lowervalue = guildChallenge.challenge_start_value;
		challengeProgressBar.uppervalue = guildChallenge.challenge_start_value + guildChallenge.challenge_progress;

		panel.AddClass( "HasGuildChallenge" );
    }

	var panelXPCircle = panel.FindChildInLayoutFile( "XPCircleContainer" );
	panelXPCircle.BLoadLayoutSnippet( 'BattlePassXPCircle' );
}

AnimateGuildSubpanelAction.prototype = new BaseAction();

AnimateGuildSubpanelAction.prototype.start = function ()
{
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( this.panel, 'BecomeVisible' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( g_DelayAfterStart ) ) );

	var contractsList = this.panel.FindChildInLayoutFile( "GuildContractList" );
	if ( contractsList.GetChildCount() > 0 )
	{
		this.seq.actions.push( new AddClassAction( this.panel, "ShowGuildContracts" ) );
		for ( var i = 0; i < contractsList.GetChildCount(); ++i )
		{
			var contractPanel = contractsList.GetChild( i );

			this.seq.actions.push( new RunFunctionAction( ( function ( contract )
			{
				return function () { contract.AddClass( "ShowGuildContract" ) };
			} )( contractPanel ) ) );
			this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
        }
	}

	if ( this.guild_progress.guild_challenge != null )
	{
		this.seq.actions.push( new AddClassAction( this.panel, 'ShowGuildChallenge' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
    }

	if ( this.total_points != 0 )
	{
		this.seq.actions.push( new AddClassAction( this.panel, 'ShowCompleted' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( g_SubElementDelay ) ) );
	}

	var panel = this.panel;
	var ownerPanel = this.ownerPanel;
	var total_points = this.total_points;
	var displayOnly = ( this.total_points == 0 );
	var startingPoints = this.startingPoints;

	this.seq.actions.push( new RunFunctionAction( function ()
	{
		UpdateSubpanelTotalPoints( panel, ownerPanel, total_points, startingPoints, displayOnly );
	} ) );

	this.seq.start();
}
AnimateGuildSubpanelAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateGuildSubpanelAction.prototype.finish = function ()
{
	this.seq.finish();
}


//-----------------------------------------------------------------------------
// Main entry point for MVP Voting
//-----------------------------------------------------------------------------

function AnimateMVPVotingScreenAction( data )
{
    this.data = data;
}

AnimateMVPVotingScreenAction.prototype = new BaseAction();

AnimateMVPVotingScreenAction.prototype.start = function ()
{
    // Create the screen and do a bunch of initial setup
    var panel = StartNewScreen( 'MVPVotingProgressScreen' );
    panel.BLoadLayoutSnippet( "MVPVotingProgress" );
    var mvpVotePanel = panel.FindChildInLayoutFile( 'PostGameMVPVote' );
    mvpVotePanel.SetMatchID( this.data.mvp_voting_progress.match_id );
    var heroContainer = mvpVotePanel.FindChildInLayoutFile( 'HeroContainer' );
    for ( var i = 0; i < this.data.mvp_voting_progress.match_players.length; ++i )
    {
        var match_player = this.data.mvp_voting_progress.match_players[i];
        var player_slot = match_player.player_slot;
		var player_hero_id = match_player.hero_id;
        var heroInfoPanel = mvpVotePanel.AddHeroPanel( match_player.account_id, match_player.vote_count );
		
        heroInfoPanel.SetDialogVariable( "hero_name_mvp", $.Localize( '#' + match_player.hero_name ) );
        heroInfoPanel.SetDialogVariable( "player_name_mvp", match_player.player_name );
        heroInfoPanel.SetDialogVariableInt( "mvp_kills", match_player.kills );
        heroInfoPanel.SetDialogVariableInt( "mvp_assists", match_player.assists );
        heroInfoPanel.SetDialogVariableInt( "mvp_deaths", match_player.deaths );
		heroInfoPanel.SetDialogVariableInt( "vote_count", match_player.vote_count );
		
        var voteClickArea = heroInfoPanel.FindChildInLayoutFile( 'VoteAreaPanel' );
		var j = i + 1;
		if ( typeof player_slot !== 'undefined' )
        {
			
            // Use this normally when viewing the details
            mvpVotePanel.SetPortraitUnitToPlayerHero( player_slot, player_hero_id, "background_hero_" + j );
			( function ( panel, account_id )
			{
				voteClickArea.SetPanelEvent( 'onactivate', function ()
				{
					$.DispatchEvent( 'PostGameMVPSubmitVote', voteClickArea, account_id );
				});
			})( voteClickArea, match_player.account_id )
        }
        else
        {
            // Use this for testing when we don't actually have match data
            mvpVotePanel.SetPortraitUnitToPlayerHero( i, player_hero_id, "background_hero_" + j );
			( function ( panel, account_id, player_index )
			{
				voteClickArea.SetPanelEvent( 'onactivate', function ()
				{
					$.DispatchEvent( 'PostGameMVPSubmitVoteTest', voteClickArea, player_index + 1 );
				});
			})( voteClickArea, match_player.account_id, i )
        }

        if( match_player.owns_event == 0 )
        {
            heroInfoPanel.AddClass( "NoCurrentBattlepass" );
        }
        else
        {
            var eventShieldPanel = heroInfoPanel.FindChildInLayoutFile( 'BPLevel' );
            eventShieldPanel.SetEventPoints(match_player.event_id, match_player.event_points);
        }
        
    }
    // Setup the sequence of actions to animate the screen
    this.seq = new RunSequentialActions();
    this.seq.actions.push( new AddClassAction( mvpVotePanel, 'ShowScreen'));
    this.seq.actions.push( new AddScreenLinkAction( panel, 'MVPProgress', '#DOTAMVPVote_TitleLink' ) );
    this.seq.actions.push( new ActionWithTimeout( new WaitForClassAction( mvpVotePanel, 'HasVotedForMVP' ), 25.0 ) );
    this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new ActionWithTimeout( new WaitForClassAction( mvpVotePanel, 'DidNotVoteForMVP' ), 1.8 ) );
    this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
    this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );

    this.seq.start();
}
AnimateMVPVotingScreenAction.prototype.update = function ()
{
    return this.seq.update();
}
AnimateMVPVotingScreenAction.prototype.finish = function ()
{
    this.seq.finish();
}


//-----------------------------------------------------------------------------
// Main entry point for battle points animation
//-----------------------------------------------------------------------------


function AnimateBattlePassScreenAction( data )
{
	this.data = data;
}

function ComputeBattlePassTier( tier_list, level )
{
	if ( !tier_list )
		return;

	var tier = 0;
	for ( var i = 0; i < tier_list.length; ++i )
	{
		if ( level >= tier_list[i] )
		{
			tier = i;
		}
	}

	return tier;
}


AnimateBattlePassScreenAction.prototype = new BaseAction();

AnimateBattlePassScreenAction.prototype.start = function ()
{
	var battlePointsStart = this.data.battle_pass_progress.battle_points_start;
	var battleLevelStart = Math.floor( battlePointsStart / this.data.battle_pass_progress.battle_points_per_level );
	var heroID = this.data.hero_id;

	var battlePointsAtLevelStart = battleLevelStart * this.data.battle_pass_progress.battle_points_per_level;

	var bpLevelStart = 0;
	var bpLevelNext = 0;
	bpLevelStart = battlePointsStart - battlePointsAtLevelStart;
	bpLevelNext = this.data.battle_pass_progress.battle_points_per_level;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'BattlePassProgressScreen' );
	panel.BLoadLayoutSnippet( "BattlePassProgress" );

	panel.SetDialogVariableInt( 'total_points_gained', 0 );

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.actions.push( new AddScreenLinkAction( panel, 'BattlePassProgress', '#DOTA_PlusPostGame_BattlePassProgress', function ()
	{
		panel.SwitchClass( 'current_screen', 'ShowBattlePassProgress' );
	} ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', 'ShowBattlePassProgress' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	var subPanelActions = new RunSkippableStaggeredActions( .3 );

	var startingPointsToAdd = 0;
	var panelCount = 0;
	var kMaxPanels = 6;

	if ( this.data.battle_pass_progress.event_game != null )
	{
	    var eventPanel = panel.FindChildInLayoutFile( "BattlePassEventGameProgress" );
	    var subpanelAction = new AnimateEventGameSubpanelAction( eventPanel, panel, this.data.battle_pass_progress.event_game, startingPointsToAdd );
	    startingPointsToAdd += subpanelAction.total_points;
	    subPanelActions.actions.push( subpanelAction );
	    if ( ++panelCount > kMaxPanels )
	        eventPanel.RemoveClass( 'Visible' );
	}

	if ( this.data.battle_pass_progress.cavern_crawl != null )
	{
	    var cavernPanel = panel.FindChildInLayoutFile( "BattlePassCavernCrawlProgress" );
	    var subpanelAction = new AnimateCavernCrawlSubpanelAction( cavernPanel, panel, this.data.battle_pass_progress.cavern_crawl, startingPointsToAdd );
	    startingPointsToAdd += subpanelAction.total_points;
	    subPanelActions.actions.push( subpanelAction );
	    if ( ++panelCount > kMaxPanels )
	        cavernPanel.RemoveClass( 'Visible' );
	}

	if ( this.data.battle_pass_progress.wagering != null )
	{
		var wagerPanel = panel.FindChildInLayoutFile( "BattlePassWagerProgress" );
		var subpanelAction = new AnimateWageringSubpanelAction( wagerPanel, panel, this.data.battle_pass_progress.wagering, startingPointsToAdd );
		startingPointsToAdd += subpanelAction.total_points;
		subPanelActions.actions.push( subpanelAction );
		if ( ++panelCount > kMaxPanels )
		    wagerPanel.RemoveClass( 'Visible' );
    }

	if ( this.data.battle_pass_progress.tips != null && this.data.battle_pass_progress.tips.length != 0 )
	{
		var tipPanel = panel.FindChildInLayoutFile( "BattlePassTipsProgress" );
		var subpanelAction = new AnimateTippingSubpanelAction( tipPanel, panel, this.data.battle_pass_progress.tips, startingPointsToAdd );
		startingPointsToAdd += subpanelAction.total_points;
		subPanelActions.actions.push( subpanelAction );
		if ( ++panelCount > kMaxPanels )
		    tipPanel.RemoveClass( 'Visible' );
    }

	if ( this.data.battle_pass_progress.actions_granted != null && this.data.battle_pass_progress.actions_granted.length != 0 )
	{
		var actionPanel = panel.FindChildInLayoutFile( "BattlePassActionsGrantedProgress" );
		var subpanelAction = new AnimateActionsGrantedSubpanelAction( actionPanel, panel, this.data.battle_pass_progress.actions_granted, startingPointsToAdd );
		startingPointsToAdd += subpanelAction.total_points;
		subPanelActions.actions.push( subpanelAction );
		if ( ++panelCount > kMaxPanels )
		    actionPanel.RemoveClass( 'Visible' );
    }

	if ( this.data.battle_pass_progress.daily_challenge != null )
	{
		var dailyPanel = panel.FindChildInLayoutFile( "BattlePassDailyChallengeProgress" );
		var subpanelAction = new AnimateDailyChallengeSubpanelAction( dailyPanel, panel, this.data.battle_pass_progress.daily_challenge, startingPointsToAdd );
		startingPointsToAdd += subpanelAction.total_points;
		subPanelActions.actions.push( subpanelAction );
		if ( ++panelCount > kMaxPanels )
		    dailyPanel.RemoveClass( 'Visible' );
    }

	if ( this.data.battle_pass_progress.weekly_challenge_1 != null )
	{
		var weeklyPanel = panel.FindChildInLayoutFile( "BattlePassWeeklyChallengeProgress" );
		var subpanelAction = new AnimateWeeklyChallengeSubpanelAction( weeklyPanel, panel, this.data.battle_pass_progress.weekly_challenge_1, startingPointsToAdd );
		startingPointsToAdd += subpanelAction.total_points;
		subPanelActions.actions.push( subpanelAction );
		if ( ++panelCount > kMaxPanels )
		    weeklyPanel.RemoveClass( 'Visible' );
	}

	if ( this.data.battle_pass_progress.guild_progress != null )
	{
		var guildPanel = panel.FindChildInLayoutFile( "BattlePassGuildProgress" );
		var subpanelAction = new AnimateGuildSubpanelAction( guildPanel, panel, this.data.battle_pass_progress.guild_progress, startingPointsToAdd, this.data.battle_pass_progress.battle_points_event_id );
		startingPointsToAdd += subpanelAction.total_points;
		subPanelActions.actions.push( subpanelAction );
		if ( ++panelCount > kMaxPanels )
			guildPanel.RemoveClass( 'Visible' );
    }

	this.seq.actions.push( subPanelActions );

	this.seq.actions.push( new AnimateBattlePassLevelsAction( panel,
        this.data.battle_pass_progress.battle_points_event_id,
        this.data.battle_pass_progress.battle_points_start,
        this.data.battle_pass_progress.battle_points_per_level,
        startingPointsToAdd ) );

	this.seq.actions.push( new WaitAction( 0.2 ) );

	this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.start();
}
AnimateBattlePassScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateBattlePassScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}

// Rubick Arcana

function AnimateRubickArcanaScreenAction( data )
{
	this.data = data;
}

AnimateRubickArcanaScreenAction.prototype = new BaseAction();

AnimateRubickArcanaScreenAction.prototype.start = function ()
{
	var heroID = this.data.hero_id;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'RubickArcanaProgressScreen' );
	panel.BLoadLayoutSnippet( "RubickArcanaProgress" );
	
	var heroModel = panel.FindChildInLayoutFile( 'RubickArcanaModel' );
	if ( typeof this.data.player_slot !== 'undefined' )
	{
		// Use this normally when viewing the details
		heroModel.SetScenePanelToPlayerHero( this.data.match_id, this.data.player_slot );
	}
	else
	{
		// Use this for testing when we don't actually have match data
		heroModel.SetScenePanelToLocalHero( this.data.hero_id );
	}

	var progress = panel.FindChildInLayoutFile('RubickArcanaProgress');
	progress.current_score = this.data.rubick_arcana_progress.arcana_start_score;
	progress.ScrollToCurrentScore();

	var endScore = this.data.rubick_arcana_progress.arcana_end_score;

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
	this.seq.actions.push( new AddScreenLinkAction( panel, 'RubickArcanaProgress', '#DOTA_PlusPostGame_RubickArcanaProgress' ) );
	this.seq.actions.push( new ActionWithTimeout( new WaitForClassAction( heroModel, 'SceneLoaded' ), 3.0 ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
	this.seq.actions.push( new AddClassAction( panel, 'ShowProgress' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new RunFunctionAction( function ()
	{
		progress.current_score = endScore;
		progress.ScrollToCurrentScore();
		progress.TriggerClass('PulseScore');
	} ) );
	this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.start();
}
AnimateRubickArcanaScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateRubickArcanaScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}


// Wraith King Arcana

function AnimateWraithKingArcanaScreenAction( data )
{
	this.data = data;
}

AnimateWraithKingArcanaScreenAction.prototype = new BaseAction();

AnimateWraithKingArcanaScreenAction.prototype.start = function ()
{
	var heroID = this.data.hero_id;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'WraithKingArcanaProgressScreen' );
    panel.BLoadLayoutSnippet( "WraithKingArcanaProgress" );

    panel.RemoveClass('ShowProgress');
    panel.AddClass('ShowScreen');

    var wraithKingPanel = panel.FindChildInLayoutFile('WraithKingArcanaProgress');
    var heroesKilled = this.data.wraith_king_arcana_progress.heroes_killed;
    var previousHeroesKilledMask = this.data.wraith_king_arcana_progress.previous_heroes_killed_mask;
    wraithKingPanel.Reset();
    wraithKingPanel.RemoveClass('ShowProgressSection');

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
    this.seq.actions.push(new SkippableAction(new WaitAction(0.1)));	
    this.seq.actions.push(new SkippableAction( new WaitForClassAction( wraithKingPanel, 'BackgroundImageLoaded') ) );
    this.seq.actions.push(new SkippableAction(new WaitAction(0.2)));
    this.seq.actions.push(new AddClassAction(panel, 'ShowProgress'));
    this.seq.actions.push(new SkippableAction(new WaitAction(0.2)));	    
    this.seq.actions.push(new RunFunctionAction(function ()
    {
        wraithKingPanel.ClearPreviousHeroKilledMask();
        for (var i = 0; i < previousHeroesKilledMask.length; ++i)
        {
            wraithKingPanel.AppendPreviousHeroKilledMask(previousHeroesKilledMask[i]);
        }
        wraithKingPanel.ShowPostGameProgress();
    }));
    this.seq.actions.push(new RunFunctionAction(function () { $.DispatchEvent('PlaySoundEffect', 'wraith_king_arcana_postgame_stinger'); }))
    this.seq.actions.push(new AddScreenLinkAction(panel, 'WraithKingArcanaProgress', '#DOTA_PostGame_WraithKingArcanaProgress' ) );
    this.seq.actions.push(new SkippableAction(new WaitAction(1.0)));
    this.seq.actions.push(new RunFunctionAction(function () { $.DispatchEvent('PlaySoundEffect', 'wraith_king_arcana_postgame_vo'); }))
    this.seq.actions.push(new SkippableAction(new AddClassAction(panel, 'HasHeroFocus')));

    for (var i = 0; i < heroesKilled.length; ++i)
    {
        ( function (me, heroIdKilled)
        {
            if (heroesKilled.length > 1) {
                me.seq.actions.push(new AddClassAction(wraithKingPanel, 'ShowProgressSection'));
            }

            wraithKingPanel.SetHasClass('MultipleHeroesKilled', heroesKilled.length > 1);

            me.seq.actions.push(new SkippableAction(new RunFunctionAction(function () {
                wraithKingPanel.SetDialogVariableInt('killed_hero_id', heroIdKilled);
                wraithKingPanel.CenterOnHero(heroIdKilled);
            })));
            me.seq.actions.push(new SkippableAction(new WaitAction(1.3)));
            me.seq.actions.push(new SkippableAction(new RunFunctionAction(function () {
                $.DispatchEvent('PlaySoundEffect', 'wraith_king_arcana_postgame_sfx');
            })));
            me.seq.actions.push(new RunFunctionAction(function () {
                wraithKingPanel.FillInHero(heroIdKilled);
            }));
            me.seq.actions.push(new SkippableAction(new WaitAction(1.0)));

        })(this, heroesKilled[i]);
    }

    this.seq.actions.push( new AddClassAction(panel, 'ShowFinalDetails'));
    this.seq.actions.push(new SkippableAction(new WaitForClassAction(wraithKingPanel, 'OnReadyToContinue')));
	this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.start();
}
AnimateWraithKingArcanaScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateWraithKingArcanaScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}


// Frostivus 2018

function AnimateFrostivusScreenAction( data )
{
	this.data = data;
}

AnimateFrostivusScreenAction.prototype = new BaseAction();

AnimateFrostivusScreenAction.prototype.start = function ()
{
	var battlePointsStart = this.data.frostivus_progress.battle_points_start;
	var battleLevelStart = Math.floor( battlePointsStart / this.data.frostivus_progress.battle_points_per_level );
	var heroID = this.data.hero_id;

	var battlePointsAtLevelStart = battleLevelStart * this.data.frostivus_progress.battle_points_per_level;

	var bpLevelStart = 0;
	var bpLevelNext = 0;
	bpLevelStart = battlePointsStart - battlePointsAtLevelStart;
	bpLevelNext = this.data.frostivus_progress.battle_points_per_level;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'Frostivus2018ProgressScreen' );
	panel.BLoadLayoutSnippet( "Frostivus2018Progress" );

	panel.SetDialogVariableInt( 'total_points_gained', 0 );

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.actions.push( new AddScreenLinkAction( panel, 'Frostivus2018Progress', '#DOTA_PlusPostGame_Frostivus2018Progress', function ()
	{
		panel.SwitchClass( 'current_screen', 'ShowFrostivus2018Progress' );
	} ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', 'ShowFrostivus2018Progress' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	( function ( me, myPanel )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				myPanel.SetDialogVariableInt( 'total_points_gained', me.data.frostivus_progress.battle_points_earned );
			} ) );
	} )( this, panel );

	//panel.FindChildInLayoutFile( "Frostivus2018TotalsRow" ).SetDialogVariableInt( 'bp_value', 0 );
	panel.SetDialogVariableInt( 'current_level_bp', bpLevelStart );
	panel.SetDialogVariableInt( 'bp_to_next_level', bpLevelNext );
	panel.FindChildInLayoutFile( 'Frostivus2018LevelShield' ).SetEventLevel( this.data.frostivus_progress.battle_points_event_id, battleLevelStart );

	this.seq.actions.push( new SkippableAction( new WaitAction( 0.75 ) ) );

	var progressBar = panel.FindChildInLayoutFile( "BattleLevelProgress" );
	progressBar.max = bpLevelNext;
	progressBar.lowervalue = bpLevelStart;
	progressBar.uppervalue = bpLevelStart;

	var bpEarned = 0;
	var bpLevel = bpLevelStart;
	var battleLevel = battleLevelStart;

	var bpRemaining = this.data.frostivus_progress.battle_points_earned;
	var bpEarnedOnRow = 0;

	while ( bpRemaining > 0 )
	{
		var bpToAnimate = 0;
		var bpToNextLevel = 0;
		bpToNextLevel = bpLevelNext - bpLevel;
		bpToAnimate = Math.min( bpRemaining, bpToNextLevel );

		if ( bpToAnimate > 0 )
		{
			this.seq.actions.push( new SkippableAction( new AnimateBattlePointsIncreaseAction( panel, bpToAnimate, bpEarnedOnRow, bpEarned, bpLevel ) ) );

			bpEarned += bpToAnimate;
			bpLevel += bpToAnimate;
			bpEarnedOnRow += bpToAnimate;
			bpRemaining -= bpToAnimate;
		}

		bpToNextLevel = bpLevelNext - bpLevel;

		if ( bpToNextLevel != 0 )
			continue;

		battleLevel = battleLevel + 1;
		bpLevel = 0;

		this.seq.actions.push( new AddClassAction(panel, 'LeveledUpStart') );

		( function ( me, battleLevelInternal )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				var levelShield = panel.FindChildInLayoutFile( 'Frostivus2018LevelShield' );
				levelShield.AddClass( 'LeveledUp' );
				levelShield.SetEventLevel( me.data.frostivus_progress.battle_points_event_id, battleLevelInternal );
			} ) );
		} )( this, battleLevel );

		this.seq.actions.push( new RemoveClassAction( panel, 'LeveledUpStart' ) );
		this.seq.actions.push( new AddClassAction( panel, 'LeveledUpEnd' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );

		( function ( me, battleLevelInternal )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				var levelShield = panel.FindChildInLayoutFile( 'Frostivus2018LevelShield' );
				levelShield.RemoveClass( 'LeveledUp' );
			} ) );
		} )( this, battleLevel );
		this.seq.actions.push( new RemoveClassAction( panel, 'LeveledUpEnd' ) );

		( function ( me, bpLevelInternal, bpLevelNextInternal )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				progressBar.lowervalue = 0;
				progressBar.uppervalue = 0;
				panel.SetDialogVariableInt( 'current_level_bp', bpLevelInternal );
				panel.SetDialogVariableInt( 'bp_to_next_level', bpLevelNextInternal );
				panel.FindChildInLayoutFile( "BattleLevelProgress" ).max = bpLevelNextInternal;
				panel.FindChildInLayoutFile( "BattleLevelProgress" ).value = bpLevelInternal;
			} ) );
		} )( this, bpLevel, bpLevelNext );
	}

	this.seq.actions.push( new WaitAction( 0.2 ) );

	this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.start();
}
AnimateFrostivusScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateFrostivusScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}

// Event Points [New Bloom 2019, etc]

function AnimateEventPointsScreenAction( data )
{
	this.data = data;
}

AnimateEventPointsScreenAction.prototype = new BaseAction();

AnimateEventPointsScreenAction.prototype.start = function ()
{
	var battlePointsStart = this.data.event_points_progress.battle_points_start;
	var battleLevelStart = Math.floor( battlePointsStart / this.data.event_points_progress.battle_points_per_level );
	var heroID = this.data.hero_id;

	var battlePointsAtLevelStart = battleLevelStart * this.data.event_points_progress.battle_points_per_level;

	var bpLevelStart = 0;
	var bpLevelNext = 0;
	bpLevelStart = battlePointsStart - battlePointsAtLevelStart;
	bpLevelNext = this.data.event_points_progress.battle_points_per_level;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'EventPointsProgressScreen' );
	panel.BLoadLayoutSnippet( "EventPointsProgress" );

	panel.SetDialogVariableInt( 'total_points_gained', 0 );

	panel.SetDialogVariable( 'event_name', $.Localize( this.data.event_points_progress.battle_points_event_name ) );

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.actions.push( new AddScreenLinkAction( panel, 'EventPointsProgress', '#DOTA_PlusPostGame_EventPointsProgress', function ()
	{
		panel.SwitchClass( 'current_screen', 'ShowEventPointsProgress' );
	} ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', 'ShowEventPointsProgress' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	( function ( me, myPanel )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				myPanel.SetDialogVariableInt( 'total_points_gained', me.data.event_points_progress.battle_points_earned );
			} ) );
	} )( this, panel );

	//panel.FindChildInLayoutFile( "EventPointsTotalsRow" ).SetDialogVariableInt( 'bp_value', 0 );
	panel.SetDialogVariableInt( 'current_level_bp', bpLevelStart );
	panel.SetDialogVariableInt( 'bp_to_next_level', bpLevelNext );
	panel.FindChildInLayoutFile( 'EventPointsLevelShield' ).SetEventLevel( this.data.event_points_progress.battle_points_event_id, battleLevelStart );

	this.seq.actions.push( new SkippableAction( new WaitAction( 0.75 ) ) );

	var wonGameRow = panel.FindChildInLayoutFile( "EventPointsWonGameRow" );
	this.seq.actions.push( new AddClassAction( wonGameRow, 'ShowRow' ) );
	this.seq.actions.push( new AddClassAction( wonGameRow, 'ShowValue' ) );

	var progressBar = panel.FindChildInLayoutFile( "BattleLevelProgress" );
	progressBar.max = bpLevelNext;
	progressBar.lowervalue = bpLevelStart;
	progressBar.uppervalue = bpLevelStart;

	var bpEarned = 0;
	var bpLevel = bpLevelStart;
	var battleLevel = battleLevelStart;

	var bpRemaining = this.data.event_points_progress.battle_points_earned;
	var bpEarnedOnRow = 0;

	while ( bpRemaining > 0 )
	{
		var bpToAnimate = 0;
		var bpToNextLevel = 0;
		bpToNextLevel = bpLevelNext - bpLevel;
		bpToAnimate = Math.min( bpRemaining, bpToNextLevel );

		if ( bpToAnimate > 0 )
		{
			this.seq.actions.push( new SkippableAction( new AnimateBattlePointsIncreaseAction( panel, bpToAnimate, bpEarnedOnRow, bpEarned, bpLevel ) ) );

			bpEarned += bpToAnimate;
			bpLevel += bpToAnimate;
			bpEarnedOnRow += bpToAnimate;
			bpRemaining -= bpToAnimate;
		}

		bpToNextLevel = bpLevelNext - bpLevel;

		if ( bpToNextLevel != 0 )
			continue;

		battleLevel = battleLevel + 1;
		bpLevel = 0;

		this.seq.actions.push( new AddClassAction(panel, 'LeveledUpStart') );

		( function ( me, battleLevelInternal )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				var levelShield = panel.FindChildInLayoutFile( 'EventPointsLevelShield' );
				levelShield.AddClass( 'LeveledUp' );
				levelShield.SetEventLevel( me.data.event_points_progress.battle_points_event_id, battleLevelInternal );
			} ) );
		} )( this, battleLevel );

		this.seq.actions.push( new RemoveClassAction( panel, 'LeveledUpStart' ) );
		this.seq.actions.push( new AddClassAction( panel, 'LeveledUpEnd' ) );
		this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );

		( function ( me, battleLevelInternal )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				var levelShield = panel.FindChildInLayoutFile( 'EventPointsLevelShield' );
				levelShield.RemoveClass( 'LeveledUp' );
			} ) );
		} )( this, battleLevel );
		this.seq.actions.push( new RemoveClassAction( panel, 'LeveledUpEnd' ) );

		( function ( me, bpLevelInternal, bpLevelNextInternal )
		{
			me.seq.actions.push( new RunFunctionAction( function ()
			{
				progressBar.lowervalue = 0;
				progressBar.uppervalue = 0;
				panel.SetDialogVariableInt( 'current_level_bp', bpLevelInternal );
				panel.SetDialogVariableInt( 'bp_to_next_level', bpLevelNextInternal );
				panel.FindChildInLayoutFile( "BattleLevelProgress" ).max = bpLevelNextInternal;
				panel.FindChildInLayoutFile( "BattleLevelProgress" ).value = bpLevelInternal;
			} ) );
		} )( this, bpLevel, bpLevelNext );
	}

	this.seq.actions.push( new WaitAction( 0.2 ) );

	this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

	this.seq.start();
}
AnimateEventPointsScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateEventPointsScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}

// ----------------------------------------------------------------------------
//
// Gauntlet Progress screen
//
// ----------------------------------------------------------------------------
function AnimateGauntletProgressScreenAction( data, gauntlet )
{
    this.data = data;
    this.gauntlet = gauntlet;
}

AnimateGauntletProgressScreenAction.prototype = new BaseAction();

AnimateGauntletProgressScreenAction.prototype.start = function ()
{
    // n.b. these are before this update
    var nWins = this.gauntlet.wins;
    var nLosses = this.gauntlet.losses;
    var bWin = !!this.gauntlet.win_game;
    var nTier = this.gauntlet.tier;
    var nTierBPAward = this.gauntlet.bp_award;
    var nGoldAward = this.gauntlet.gold_award;
    var nShardAward = this.gauntlet.shard_award;

    var bFinished = ( bWin && nWins >= 2 ) || ( !bWin && nLosses >= 1 );
    
    var nBPAwarded = 0;
    if ( bFinished && bWin )
    {
        nBPAwarded = nTierBPAward;
    }

    var panel = StartNewScreen( 'GauntletProgressScreen' );
    panel.BLoadLayoutSnippet( "GauntletProgress" );

    panel.SetDialogVariableInt( 'total_points_gained', 0 );
    panel.SetDialogVariableInt( 'gauntlet_gold', 0 );
    panel.SetDialogVariableInt( 'gauntlet_shards', 0 );
    panel.SetDialogVariable( 'gauntlet_tier_name', $.Localize( '#DOTA_GauntletTierName_' + nTier ) );

    // Set initial state
    for ( var i = 0; i < nWins; ++i )
    {
        var pipPanel = panel.FindChildInLayoutFile( 'GauntletWin' + i );
        if ( pipPanel == null )
            break;

        pipPanel.AddClass( 'PipActive' );
    }

    for ( var i = 0; i < nLosses; ++i )
    {
        var pipPanel = panel.FindChildInLayoutFile( 'GauntletLose' + i );
        if ( pipPanel == null )
            break;

        pipPanel.AddClass( 'PipActive' );
    }

    // Only show additional points if we won the whole gauntlet
    if ( nBPAwarded == 0 )
    {
        panel.AddClass( 'HideAdditionalBattlePoints' );
    }

    const ANIMATE_PIP_WIN_X = 841;
    const ANIMATE_PIP_WIN_Y = 624;
    const ANIMATE_PIP_WIN_OFFSET = 64;
    const ANIMATE_PIP_LOSE_X = 1070;
    const ANIMATE_PIP_LOSE_Y = 624;
    const ANIMATE_PIP_LOSE_OFFSET = 64;

    var newPipPanel = panel.FindChildInLayoutFile( 'GauntletAnimatePip' );
    var resultPipPanel = null;
    if( newPipPanel )
    {
        if ( bWin )
        {
            newPipPanel.AddClass( 'GauntletWin' );
            newPipPanel.SetPositionInPixels( ANIMATE_PIP_WIN_X + ANIMATE_PIP_WIN_OFFSET * nWins, ANIMATE_PIP_WIN_Y, 0 );
            resultPipPanel = panel.FindChildInLayoutFile( 'GauntletWin' + nWins );
        }
        else
        {
            newPipPanel.AddClass( 'GauntletLose' );
            newPipPanel.SetPositionInPixels( ANIMATE_PIP_LOSE_X + ANIMATE_PIP_LOSE_OFFSET * nLosses, ANIMATE_PIP_LOSE_Y, 0 );
            resultPipPanel = panel.FindChildInLayoutFile( 'GauntletLose' + nLosses );
        }
    }

    // animation begins 

    this.seq = new RunSequentialActions();
    this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
    this.seq.actions.push( new AddScreenLinkAction( panel, 'GauntletProgress', '#DOTA_GauntletPostGame_Tooltip' ) );
    this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

    // gauntlet-specific stuff starts here

    if ( newPipPanel != null )
    {
        this.seq.actions.push( new AddClassAction( newPipPanel, 'Animate' ) );
        this.seq.actions.push( new AddClassAction( panel, 'GauntletScreenShake' ) );

        // wait for anim to complete, then remove anim classes and replace with active pip directly
        this.seq.actions.push( new SkippableAction( new WaitAction( 1.0 ) ) );
        this.seq.actions.push( new OptionalSkippableAction( new PlaySoundAction( bWin ? 'UI.Gauntlet.WinStamp' : 'UI.Gauntlet.LoseStamp' ) ) );

        if ( resultPipPanel != null )
        {
            this.seq.actions.push( new AddClassAction( resultPipPanel, 'PipActive' ) );
        }

        this.seq.actions.push( new SkippableAction( new WaitAction( 0.7 ) ) );

        this.seq.actions.push( new RemoveClassAction( newPipPanel, 'Animate' ) );
        this.seq.actions.push( new RemoveClassAction( panel, 'GauntletScreenShake' ) );
    }

    var resultClass = 'GauntletShowInProgress';
    if ( bFinished )
    {
        if ( bWin )
        {
            resultClass = 'GauntletShowWin';
            if( nTier < 10 )
            {
                resultClass = 'GauntletShowPromote';
                panel.SetDialogVariable( 'promote_tier_name', $.Localize( '#DOTA_GauntletTierName_' + (nTier+1) ) );
            }
        }
        else
        {
            resultClass = 'GauntletShowLose';
        }
    }

    this.seq.actions.push( new AddClassAction( panel, resultClass ) );
    this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
    if ( bFinished && bWin )
        this.seq.actions.push( new OptionalSkippableAction( new PlaySoundAction( 'UI.Gauntlet.Award' ) ) );

    if ( bFinished && bWin && nGoldAward > 0 )
    {
        this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
        var par = new RunParallelActions();
        var duration = GetXPIncreaseAnimationDuration( nGoldAward );
        par.actions.push( new AnimateDialogVariableIntAction( panel, 'gauntlet_gold', 0, nGoldAward, duration ) );
        par.actions.push( new PlaySoundAction( "Plus.shards_tally", duration ) );
        this.seq.actions.push( new SkippableAction( par ) );
    }

    if ( bFinished && bWin && nShardAward > 0 )
    {
        this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );
        var par = new RunParallelActions();
        var duration = GetXPIncreaseAnimationDuration( nShardAward );
        par.actions.push( new AnimateDialogVariableIntAction( panel, 'gauntlet_shards', 0, nShardAward, duration ) );
        par.actions.push( new PlaySoundAction( "Plus.shards_tally" ) );
        this.seq.actions.push( new SkippableAction( par ) );
    }

    if ( nBPAwarded > 0 )
    {
        this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

        this.seq.actions.push( new RunFunctionAction( function () {
            panel.SetDialogVariableInt( 'total_points_gained', nBPAwarded );
        } ) );

        var par = new RunParallelActions();
        par.actions.push( new AnimateDialogVariableIntAction( panel, 'total_points_gained', 0, nBPAwarded, 1 ) );
        par.actions.push( new AnimateBattlePassLevelsAction( panel,
            this.gauntlet.battle_points_event_id,
            this.gauntlet.battle_points_start,
            this.gauntlet.battle_points_per_level,
            nBPAwarded ) );
        this.seq.actions.push( new SkippableAction( par ) );
    }
    else
    {
        // Need to create this to initialize state even when no BP awarded
        this.seq.actions.push( new AnimateBattlePassLevelsAction( panel,
            this.gauntlet.battle_points_event_id,
            this.gauntlet.battle_points_start,
            this.gauntlet.battle_points_per_level,
            nBPAwarded ) );
    }

    // end of gauntlet-specific stuff

    this.seq.actions.push( new StopSkippingAheadAction() );
    this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
    this.seq.actions.push( new SwitchClassAction( panel, 'current_screen', '' ) );
    this.seq.actions.push( new SkippableAction( new WaitAction( 0.5 ) ) );

    // animation done, start it
    this.seq.start();
}

AnimateGauntletProgressScreenAction.prototype.update = function () {
    return this.seq.update();
}
AnimateGauntletProgressScreenAction.prototype.finish = function () {
    this.seq.finish();
}


// ----------------------------------------------------------------------------
//
// Coach Rating Screen
//
// ----------------------------------------------------------------------------

function WaitForRatingStateChange( panel )
{
	this.panel = panel;
}
WaitForRatingStateChange.prototype = new BaseAction();
WaitForRatingStateChange.prototype.update = function ()
{
	var goodRatingButton = this.panel.FindChildInLayoutFile( 'GoodRatingButton' );
	if ( goodRatingButton.BHasClass( 'Selected' ) )
		return false;

	var badRatingButton = this.panel.FindChildInLayoutFile( 'BadRatingButton' );
	if ( badRatingButton.BHasClass( 'Selected' ) )
		return false;

	var abusiveRatingButton = this.panel.FindChildInLayoutFile( 'AbusiveRatingButton' );
	if ( abusiveRatingButton.BHasClass( 'Selected' ) )
		return false;

	return true;
}

function WaitForAbusiveRatingPopupAction()
{
	this.popupActive = false;
}
WaitForAbusiveRatingPopupAction.prototype = new BaseAction();
WaitForAbusiveRatingPopupAction.prototype.update = function ()
{
	return this.popupActive;
}

function AnimateCoachRatingScreenAction( data, coach_data )
{
	this.data = data;
	this.coach_data = coach_data;
}

function WaitForSurveyStateChange( panel )
{
	this.panel = panel;
}
WaitForSurveyStateChange.prototype = new BaseAction();
WaitForSurveyStateChange.prototype.update = function ()
{
	var goodRatingContainer = this.panel.FindChildInLayoutFile( 'GoodRatingContainer' );
	if ( !goodRatingContainer.enabled )
		return false;

	var badRatingContainer = this.panel.FindChildInLayoutFile( 'BadRatingContainer' );
	if ( !badRatingContainer.enabled)
		return false;

	var skipButton = this.panel.FindChildInLayoutFile( 'SkipButton' );
	if ( skipButton.BHasClass( 'Selected' ) )
		return false;

	return true;
}

AnimateCoachRatingScreenAction.prototype = new BaseAction();

AnimateCoachRatingScreenAction.prototype.start = function ()
{
	var action_data = this.data;
	var rating_data = this.coach_data;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'CoachRatingScreen' );
	panel.BLoadLayoutSnippet( "CoachRating" );

	var countdownProgressBar = panel.FindChildInLayoutFile( 'CoachTimeRemainingProgressBar' );
	var goodRatingButton = panel.FindChildInLayoutFile( 'GoodRatingButton' );
	var badRatingButton = panel.FindChildInLayoutFile( 'BadRatingButton' );
	var abusiveRatingButton = panel.FindChildInLayoutFile( 'AbusiveRatingButton' );

	var flCountdownDuration = 15.0;
	countdownProgressBar.max = flCountdownDuration;

	panel.SetDialogVariable( 'coach_player_name', rating_data.coach_player_name );
	panel.FindChildInLayoutFile( 'CoachAvatarImage' ).accountid = rating_data.coach_account_id;
	panel.FindChildInLayoutFile( 'CoachRatingBadge' ).rating = rating_data.coach_rating;

	var SubmitRating = function ( strRating, strReason )
	{
		if ( action_data.match_id == '0')
			return;

		$.DispatchEvent( 'DOTASubmitCoachRating', action_data.match_id, rating_data.coach_account_id, strRating, strReason );

		// Once a rating has been changed, disable all the other UI
		goodRatingButton.enabled = false;
		badRatingButton.enabled = false;
		abusiveRatingButton.enabled = false;
	};

	$.RegisterEventHandler( 'Activated', goodRatingButton, function ()
	{
		goodRatingButton.AddClass( 'Selected' );
		SubmitRating( 'k_ECoachTeammateRating_Positive', '' );
	});
	$.RegisterEventHandler( 'Activated', badRatingButton, function ()
	{
		badRatingButton.AddClass( 'Selected' );
		SubmitRating( 'k_ECoachTeammateRating_Negative', '' );
	});

	var waitForAbusiveRatingPopupAction = new WaitForAbusiveRatingPopupAction();
	$.RegisterEventHandler( 'Activated', abusiveRatingButton, function ()
	{
		waitForAbusiveRatingPopupAction.popupActive = true;
		$.DispatchEvent( 'PostGameProgressConfirmAbusiveCoachRating', panel );
	});
	$.RegisterEventHandler( 'PostGameProgressConfirmAbusiveCoachRatingFinished', panel, function ( bSubmit, strReason )
	{
		if ( bSubmit )   
		{   
			abusiveRatingButton.AddClass( 'Selected' );
			SubmitRating( 'k_ECoachTeammateRating_Abusive', strReason );
		}
		waitForAbusiveRatingPopupAction.popupActive = false;
	});

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new AddScreenLinkAction( panel, 'CoachRatingProgress', '#DOTA_CoachRatingPostGame_CoachRating', function ()
	{
		panel.AddClass( 'RatingScreenForceVisible' );
	}));
	this.seq.actions.push( new WaitAction( 0.5 ) );
	this.seq.actions.push( new AddClassAction( panel, 'RatingScreenVisible' ) );

	var countdownActions = new RunParallelActions();
	countdownActions.actions.push( new AnimateDialogVariableIntAction( panel, 'countdown_seconds', flCountdownDuration, 0, flCountdownDuration ) );
	countdownActions.actions.push( new AnimateProgressBarAction( countdownProgressBar, flCountdownDuration, 0, flCountdownDuration ) );

	var durationAction = new RunUntilSingleActionFinishedAction();
	durationAction.actions.push( countdownActions );
	durationAction.actions.push( new WaitForRatingStateChange( panel ) );
	durationAction.actions.push( new WaitForClassAction( panel, 'CountdownFinished' ) );
	this.seq.actions.push( durationAction );

	this.seq.actions.push( new AddClassAction( panel, 'CountdownFinished' ) );
	this.seq.actions.push( waitForAbusiveRatingPopupAction );

	this.seq.actions.push( new WaitAction( 0.5 ) );
	this.seq.actions.push( new RemoveClassAction( panel, 'RatingScreenVisible' ) );
	this.seq.actions.push( new WaitAction( 0.5 ) );

	this.seq.start();
}
AnimateCoachRatingScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateCoachRatingScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}




// ----------------------------------------------------------------------------
//
// Player Match Survey Screen
//
// ----------------------------------------------------------------------------
function AnimatePlayerMatchSurveyScreenAction( data )
{
	this.data = data;
}

AnimatePlayerMatchSurveyScreenAction.prototype = new BaseAction();

AnimatePlayerMatchSurveyScreenAction.prototype.start = function ()
{
	var data = this.data;

	// Create the screen and do a bunch of initial setup
	var panel = StartNewScreen( 'PlayerMatchSurveyScreen' );
	panel.BLoadLayoutSnippet( "PlayerMatchSurvey" );

	var goodRatingContainer = panel.FindChildInLayoutFile( 'GoodRatingContainer' );
	var badRatingContainer = panel.FindChildInLayoutFile( 'BadRatingContainer' );
	var skipButton = panel.FindChildInLayoutFile( 'SkipButton' );

	var SubmitRating = function ( nRating, nFlags )
	{
		if( !data.match_id || data.match_id == '0' )
		{
			data.match_id = 0;
		}
		$.DispatchEvent( 'DOTAMatchSubmitPlayerMatchSurvey', data.match_id, nRating, nFlags );

		// Once a rating has been changed, disable all the other UI
		goodRatingContainer.enabled = false;
		badRatingContainer.enabled = false;
		
		PlayUISoundScript( "ui_goto_player_page" );	
	};

	for ( var i = 1; i < goodRatingContainer.GetChildCount() ; ++i )
	{
		var goodRatingButton = goodRatingContainer.GetChild( i );
		var nRating = goodRatingButton.GetAttributeInt("rating_flag", 0);

		var reg = function( goodRatingButton, nRating )
		{
			$.RegisterEventHandler('Activated', goodRatingButton, function ( )
			{
				goodRatingButton.AddClass( 'Selected' );
				SubmitRating( 1, nRating );
			});
		};
		reg( goodRatingButton, nRating );
	}

	for ( var i = 1; i < badRatingContainer.GetChildCount() ; ++i )
	{
		var badRatingButton = badRatingContainer.GetChild( i );
		var nRating = badRatingButton.GetAttributeInt("rating_flag", 0);
		var reg = function( badRatingButton, nRating )
		{
			$.RegisterEventHandler('Activated', badRatingButton, function ( )
			{
				badRatingButton.AddClass( 'Selected' );
				SubmitRating( -1, nRating );
			});
		};
		reg( badRatingButton, nRating );
	}

	// scramble the buttons to avoid bias
	for ( var k = 0 ; k < 5 ; ++ k)
	{
		for ( var i = 1; i < goodRatingContainer.GetChildCount() ; ++i )
		{
			var randint = Math.floor( (goodRatingContainer.GetChildCount()-1)*Math.random() ) + 1; 
			var button = goodRatingContainer.GetChild( i );
			goodRatingContainer.MoveChildAfter( button, goodRatingContainer.GetChild(randint) );
		}
		for ( var i = 1; i < badRatingContainer.GetChildCount() ; ++i )
		{
			var randint = Math.floor( (badRatingContainer.GetChildCount()-1)*Math.random() ) + 1; 
			var button = badRatingContainer.GetChild( i );
			badRatingContainer.MoveChildAfter( button, badRatingContainer.GetChild(randint) );
		}
	}


	$.RegisterEventHandler('Activated', skipButton, function ()
	{
		skipButton.AddClass( 'Selected' );
		panel.AddClass("Skipped")
		SubmitRating( 0, 0 );
	});

	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	this.seq.actions.push( new AddClassAction( panel, 'ShowScreen' ) );
	this.seq.actions.push( new AddScreenLinkAction( panel, 'PlayerMatchSurveyProgress', '#DOTA_PlayerMatchSurveyPostGame_PlayerMatchSurvey', function ()
	{
		panel.AddClass( 'RatingScreenForceVisible' );
	}));
	this.seq.actions.push( new WaitAction( 0.25 ) );
	this.seq.actions.push( new AddClassAction( panel, 'RatingScreenVisible' ) );

	var durationAction = new RunUntilSingleActionFinishedAction();
	durationAction.actions.push( new WaitForSurveyStateChange( panel ) );
	this.seq.actions.push( durationAction );

	this.seq.actions.push( new AddClassAction( panel, 'HideSkipButton' ) );
	this.seq.actions.push( new WaitAction( 0.5 ) );
	
	this.seq.actions.push( new PlaySoundAction( "ui_hero_select_slide_late" ) );
	this.seq.actions.push( new AddClassAction( panel, 'SubmitFeedbackVisible' ) );

	this.seq.actions.push( new WaitAction( 1.25 ) );
	this.seq.actions.push( new RemoveClassAction( panel, 'RatingScreenVisible' ) );
	this.seq.actions.push( new WaitAction( 0.5 ) );

	this.seq.start();
}

AnimatePlayerMatchSurveyScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimatePlayerMatchSurveyScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}

// MVP v2

function AnimateMVP2ScreenAction( data )
{
	this.data = data;
}

AnimateMVP2ScreenAction.prototype = new BaseAction();

AnimateMVP2ScreenAction.prototype.start = function ()
{
	// Create the screen and do a bunch of initial setup
	var mvp2ScreenPanel = StartNewScreen( 'MVP2Screen' );
	mvp2ScreenPanel.BLoadLayoutSnippet("MVP2Screen");

	var mapContainer = mvp2ScreenPanel.FindChildInLayoutFile("MVPMapContainer");

	var mvpDetails = this.data.mvp2.mvps[0];
	var bDireWon = mvpDetails.was_dire;

	if ( bDireWon )
	{
		mapContainer.BLoadLayoutSnippet("MVP2MapDire");
	}
	else
	{
		mapContainer.BLoadLayoutSnippet("MVP2MapRadiant");
	}

	//// Helper functions/containers for sequence actions
	
	var mvp2Data = this.data.mvp2;

	var flMaxCountUpDuration = 0.75;
	var flMinCountUpDuration = 0.25;
	var flCountUpDuration = Math.random() * (flMaxCountUpDuration - flMinCountUpDuration) + flMinCountUpDuration;

	//helper for accolades
	var addAccolade = function (nAccoladeIndex, accoladeObject, accoladeContainer, wasDire)
	{
		var accolade_panel = $.CreatePanel( 'Panel', accoladeContainer, '' );
		accolade_panel.BLoadLayoutSnippet('MVPAccolade');

		var accolade_id = accoladeObject.type;
		var accolade_value = accoladeObject.detail_value;
		var accolade = g_MVP_Accolade_TypeMap[accolade_id];

		if (accolade == undefined)
		{
			$.Msg('No accolade of type ' + accolade_id.toString());
			return null;
		}

		var gradient_colour = wasDire ? "red" : "green";
		accolade_panel.FindChildInLayoutFile('gradient').AddClass('mvp_gradient_' + gradient_colour);
		accolade_panel.FindChildInLayoutFile('icon').AddClass('mvp_icon_' + accolade.icon);
		accolade_panel.FindChildInLayoutFile('icon').style.backgroundImage = 'url("' + accolade.icon + '")';
		accolade_panel.FindChildInLayoutFile('icon').style.backgroundRepeat = 'no-repeat';
		accolade_panel.FindChildInLayoutFile('icon').style.backgroundPosition = 'center';
		accolade_panel.FindChildInLayoutFile('icon').style.backgroundSize = 'cover';

		if (accolade.ability_name != undefined)
		{
			accolade_panel.FindChildInLayoutFile('ability_icon').abilityname = accolade.ability_name
		}
		else
		{
			accolade_panel.FindChildInLayoutFile('ability_icon').style.opacity = 0;
		}

		accolade_panel.SetDialogVariable('title', $.Localize(accolade.title_loc_token));
		accolade_panel.AddClass('Accolade' + nAccoladeIndex);

		var details_panel = accolade_panel.FindChildInLayoutFile('details');

		if (accolade.detail_loc_token != undefined)
		{
			details_panel.SetLocString(accolade.detail_loc_token);
			accolade_panel.SetDialogVariableInt('detailvalue', accolade_value);
		}
		else
		{
			$.Msg('accolade ' + accolade_id.toString() + ' missing detail_loc_token');
		}

		return accolade_panel;
	};

	var map = mapContainer.FindChildInLayoutFile('MVPMap');

	////
	// Setup the sequence of actions to animate the screen
	this.seq = new RunSequentialActions();
	
	this.seq.actions.push( new AddScreenLinkAction( mvp2ScreenPanel, 'MVPProgress', '#DOTAMVP2_TitleLink' ) );
	this.seq.actions.push( new AddClassAction( mvp2ScreenPanel, 'ShowScreen' ) );

	// Wait for map to load
	this.seq.actions.push( new WaitForClassAction( map, 'SceneLoaded' ) );

	var match_id = this.data.match_id;

	var mvpPanel = null;
	var mvpAccolades = [];
	// Load up the MVP and HMs
	this.seq.actions.push( new RunFunctionAction( function () 
		{
			// Setup mvp model
			{
				mvpPanel = mvp2ScreenPanel.FindChildInLayoutFile('MVPDetails');
				mvpPanel.SetDialogVariableInt("user_account_id", mvpDetails.accountid );
				mvpPanel.SetDialogVariable("hero", $.Localize('#' + mvpDetails.heroname));

				if (mvpDetails.guildid != undefined)
				{
					mvpPanel.FindChildInLayoutFile('GuildImage').guildid = mvpDetails.guildid;
					mvpPanel.SetDialogVariableInt("user_guild_id", mvpDetails.guildid);
				}
				else
				{
					var guildPanel = mvpPanel.FindChildInLayoutFile('GuildDetails');
					if (guildPanel != undefined)
					{
						guildPanel.RemoveAndDeleteChildren();
					}
				}

				if (mvpDetails.overrideheroid == undefined)
				{
					map.SpawnHeroInScenePanelByPlayerSlot( match_id, mvpDetails.slot, "featured_hero" );
				}
				else
				{
					var econId = mvpDetails.overrideeconid;
					if(econId == undefined)
					{
						econId = -1;
					}

					map.SpawnHeroInScenePanelByHeroId( mvpDetails.overrideheroid, "featured_hero", econId );
				}

				//setup accolades for mvp
				var accoladeContainer = mvpPanel.FindChildInLayoutFile('Accolades');

				for (var i in mvpDetails.accolades)
				{
					var accolade = mvpDetails.accolades[i];

					var accoladePanel = addAccolade(i, accolade, accoladeContainer, mvpDetails.was_dire);

					if (accoladePanel != null)
					{
						mvpAccolades.push(accoladePanel);
					}
				}
			}

			// Setup honorable mentions
			var honorableMentions = mvp2ScreenPanel.FindChildInLayoutFile('HonorableMentions');

			for (var i = 1; i < 3 && i < mvp2Data.mvps.length; ++i)
			{
				var honorableMentionData = mvp2Data.mvps[i];
				var honorableMentionPanel = $.CreatePanel('Panel', honorableMentions, '');
				honorableMentionPanel.BLoadLayoutSnippet('HonorableMention');
				honorableMentionPanel.SetDialogVariableInt("user_account_id", honorableMentionData.accountid);
				if (honorableMentionData.guildid != undefined)
				{
					honorableMentionPanel.SetDialogVariableInt("user_guild_id", honorableMentionData.guildid);
				}
				else
				{
					var guildPanel = honorableMentionPanel.FindChildInLayoutFile('GuildName');
					if (guildPanel != null)
					{
						guildPanel.style.opacity = 0;
					}
				}
				honorableMentionPanel.AddClass(honorableMentionData.was_dire ? "dire" : "radiant");
				honorableMentionPanel.AddClass('HonorableMention' + i.toString());
				var model = honorableMentionPanel.FindChildInLayoutFile('HonorableMentionModel');

				honorableMentionPanel.AddClass(honorableMentionData.heroname);
				if (honorableMentionData.overrideheroid == undefined)
				{
					model.SetScenePanelToPlayerHero(match_id, honorableMentionData.slot);
				}
				else
				{
					model.SetScenePanelToLocalHero(honorableMentionData.overrideheroid);
				}

				var accoladeContainer = honorableMentionPanel.FindChildInLayoutFile('Accolades');
				for (var j in honorableMentionData.accolades)
				{
					var accolade = honorableMentionData.accolades[j];

					if (accolade != undefined)
					{
						addAccolade(j, accolade, accoladeContainer, honorableMentionData.was_dire);
						break; // THERE CAN BE ONLY ONE
					}
					else
					{
						$.Msg("Unable to find accolade of type " + j.toString());
					}
				}
			}
		} )
	);


	this.seq.actions.push( new SkippableAction( new WaitAction(0.5)));
	var honorableMentionsContainer = mvp2ScreenPanel.FindChildInLayoutFile('HonorableMentionsContainer');
	this.seq.actions.push( new AddClassAction( honorableMentionsContainer, 'HMAnimateIn') );
	this.seq.actions.push( new SkippableAction( new WaitAction(0.5)));
	this.seq.actions.push( new RunFunctionAction( function () 
	{
		mvpPanel.AddClass('MVPDetailsAnimateIn');
		for (var i in mvpAccolades)
		{
			mvpAccolades[i].AddClass( 'MVPAnimateIn' );
		}
	}));

	// first mvp accolade
	this.seq.actions.push( new WaitAction(0.2) );
	this.seq.actions.push( new PlaySoundAction("ui_hero_select_slide_late"));

	// second mvp accolade
	this.seq.actions.push( new WaitAction(0.4) );
	this.seq.actions.push( new PlaySoundAction("ui_hero_select_slide_late"));

	// third mvp accolade
	this.seq.actions.push( new WaitAction(0.5) );
	this.seq.actions.push( new PlaySoundAction("ui_hero_select_slide_late"));

	this.seq.actions.push( new SkippableAction( new WaitAction(0.5)));

	this.seq.actions.push( new StopSkippingAheadAction() );
	this.seq.actions.push( new SkippableAction( new WaitAction( 1.5 ) ) );
	this.seq.actions.push( new SwitchClassAction( mvp2ScreenPanel, 'current_screen', '' ) );
	this.seq.actions.push( new SkippableAction( new WaitAction( 7.0 ) ) );

	this.seq.start();
}
AnimateMVP2ScreenAction.prototype.update = function ()
{
	return this.seq.update();
}
AnimateMVP2ScreenAction.prototype.finish = function ()
{
	this.seq.finish();
}


// ----------------------------------------------------------------------------
//
// Debugging
//
// ----------------------------------------------------------------------------

function TestAnimateHeroBadgeLevel()
{
    var data =
	{
	    hero_id: 11,
	    hero_badge_xp_start: 22850,

	    hero_badge_progress:
		[
			{
			    xp_type: HERO_BADGE_XP_TYPE_MATCH_FINISHED,
			    xp_amount: 50
			},
			{
			    xp_type: HERO_BADGE_XP_TYPE_MATCH_WON,
			    xp_amount: 50
			},
			{
			    xp_type: HERO_BADGE_XP_TYPE_CHALLENGE_COMPLETED,
			    xp_amount: 375,

			    challenge_stars: 2,
			    challenge_description: "Kill an enemy hero in 15 seconds after teleporting in 1/2/3 times."
			},
		],

	    hero_badge_level_up:
		{
		    18:
				{
				    tier_number: 4,
				    rewards:
					[
						{
						    reward_type: HERO_BADGE_LEVEL_REWARD_TIER,
						    tier_name: "#DOTA_HeroLevelBadgeTier_Platinum",
						    tier_class: "PlatinumTier"
						},
						{
						    reward_type: HERO_BADGE_LEVEL_REWARD_CHAT_WHEEL,
						    chat_wheel_message: "#dota_chatwheel_message_nevermore_4",
						    all_chat: 1,
						    sound_event: "soundboard.ay_ay_ay"
						}
					],
				},
		    19:
				{
				    tier_number: 4,
				    rewards: 
					[
						{
						    reward_type: HERO_BADGE_LEVEL_REWARD_CURRENCY,
						    currency_amount: 3000
						}
					]
				}
		},
	    hero_relics_progress:
		[
			{
			    relic_type: 0,
			    relic_rarity: 1,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 1,
			    relic_rarity: 1,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 2,
			    relic_rarity: 1,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 3,
			    relic_rarity: 1,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 4,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 5,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 6,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 7,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 8,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 9,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 10,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 11,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 12,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			},
			{
			    relic_type: 13,
			    relic_rarity: 0,
			    primary_attribute: 1,
			    starting_value: 25,
			    ending_value: 29,
			}
		],

	    dota_plus_progress:
		{
		    tips:
			[
				{
				    account_id: 172258,
				    count: 2,
				    amount: 50,
				},
			],

		    cavern_crawl:
			{
			    event_id: 29,
			    hero_id: 87,
			    hero_name: 'disruptor',
			    shard_amount: 150,
			},

		    victory_prediction_shard_reward: 20,

		    role_call_shard_reward: 25
		}

	};

	TestProgressAnimation( data );
}

function TestAnimateBattlePass()
{
	var data =
	{
		hero_id: 87,

		battle_pass_progress:
		{
			battle_points_event_id: 29,
			battle_points_start: 74850,
			battle_points_per_level: 1000,

			wagering:
			{
				wager_amount: 2,
				conversion_ratio: 100,
				wager_token_bonus_pct: 25,
				wager_streak_bonus_pct: 10,
			},

			tips:
			[
				{
					account_id: 172258,
					count: 2,
					amount: 250,
				},
//				{
//					account_id: 236096,
//					count: 1,
//					amount: 500,
//				},
//				{
//					account_id: 236096,
//					count: 3,
//					amount: 500,
//				},
//				{
//					account_id: 236096,
//					count: 1,
//					amount: 500,
//				},
//				{
//					account_id: 172258,
//					count: 2,
//					amount: 250,
//				},
//				{
//					account_id: 236096,
//					count: 1,
//					amount: 500,
//				},
//				{
//					account_id: 236096,
//					count: 3,
//					amount: 500,
//				},
//				{
//					account_id: 236096,
//					count: 1,
//					amount: 500,
//				},
//				{
//					account_id: 236096,
//					count: 1,
//					amount: 500,
//				},
			],

			cavern_crawl:
			{
				hero_id: 87,
				bp_amount: 375,
			},
			
			event_game:
            {
                bp_amount: 1200,
                win_points: 1000,
                loss_points: 0,
                treasure_points: 200,
                weekly_cap_remaining: 1000,
                weekly_cap_total: 3000,
            },

			//daily_challenge:
			//{
			//	hero_id: 87,
			//	bp_amount: 125,
			//},

			//weekly_challenge_1:
			//{
			//	challenge_description: 'Kill 50 enemy heroes',
			//	progress: 20000,
			//	end_progress: 30000,
			//	complete_limit: 50000,
			//	bp_amount: 250,
			//},

			actions_granted:
			[
				{
					action_id: 704,
					quantity: 2,
					bp_amount: 100,
					action_image: "file://{images}/spellicons/consumables/seasonal_ti9_shovel.png"
				},
				{
					action_id: 705,
					quantity: 1,
					bp_amount: 5000,
					action_image: "file://{images}/spellicons/consumables/seasonal_ti9_shovel.png"
				},
			],

			guild_progress:
			{
				guild_contracts:
				[
					{
						challenge_instance_id: 2152900061,
						challenge_parameter: 23,
						completed: true,
						battle_point_reward: 150,
						guild_point_reward: 150
					},
					{
						challenge_instance_id: 2506886225,
						challenge_parameter: 22000,
						completed: true,
						battle_point_reward: 150,
						guild_point_reward: 150
					},
					{
						challenge_instance_id: 2506886225,
						challenge_parameter: 22000,
						completed: false,
						battle_point_reward: 150,
						guild_point_reward: 150
					},
				],

				guild_challenge:
				{
					challenge_image: "file://{images}/guilds/challenges/guild_networth_by_time.png",
					challenge_start_value: 1234,
					challenge_max_value: 4500,
					challenge_progress: 400
                }
            }
		}
	};

	TestProgressAnimation( data );
}

function TestAnimateGauntletProgress()
{
    var data =
    {
        hero_id: 87,
        gauntlet_progress:
        {
            tier: 4,
            wins: 2,
            losses: 0,
            win_game: 1,
            bp_award: 1500,
            gold_award: 200,
            shard_award: 1000,

            battle_points_event_id: 29,
            battle_points_start: 73295,
            battle_points_per_level: 1000
        }
    }

    TestProgressAnimation( data );
}


function TestAnimateCavernCrawl()
{
	var data =
	{
		hero_id: 92,
		cavern_crawl_progress:
		{
            event_id: 29,
            map_variant: 0,
            turbo_mode: false,
            map_progress:
                [
                    {
                        path_id_completed: 0,
                        room_id_claimed: 1,
                    }
                ],
 		},
	};

	TestProgressAnimation( data );
}


function TestAnimateRubickArcanaProgress()
{
	var data =
	{
		hero_id: 86,

		rubick_arcana_progress:
		{
			arcana_start_score: 34,
			arcana_end_score: 36
		}
	};

	TestProgressAnimation( data );
}


function TestAnimateWraithKingArcanaProgress()
{
	var data =
	{
		hero_id: 42,

		wraith_king_arcana_progress:
        {
            previous_heroes_killed_mask:
                [  
                    1, 2, 3, 4, 5
                ],
            heroes_killed:
                [
                    6, 82
                ]
		}
	};

	TestProgressAnimation( data );
}

function TestAnimateFrostivusProgress()
{
	var data =
	{
		hero_id: 87,
		frostivus_progress:
		{
			battle_points_event_id: 24,
			battle_points_start: 2200,
			battle_points_per_level: 1000,
			battle_points_earned: 1250,
			battle_points_daily_bonus_earned: 1000,
		}
	};

	TestProgressAnimation( data );
}

function TestAnimateEventPointsProgress()
{
	$.GetContextPanel().AddClass( 'Season_NewBloom2019' );
	var data =
	{
		hero_id: 87,
		event_points_progress:
		{
			battle_points_event_id: 24,
			battle_points_start: 2200,
			battle_points_per_level: 1000,
			battle_points_earned: 1250,
			battle_points_event_name: '#DOTA_EventName_NewBloom2019',
		}
	};

	TestProgressAnimation( data );
}

function TestMVPVotingProgress() {
 
    var data =
	{
	    mvp_voting_progress:
        {
            match_id: '123456789',
            match_players:
            [
                {
                    hero_id: 34,
                    hero_name: 'Tinker',
                    event_points: 0,
                    event_id: 25,
                    vote_count: 2,
                    player_name: 'Eric L',
                    account_id: 1,
                    kills: 7,
                    assists: 3,
                    deaths: 6,
					owns_event: 0
                },
                {
                    hero_id: 29,
                    hero_name: 'Tidehunter',
                    event_points: 8000,
                    event_id: 25,
                    vote_count: 0,
                    player_name: 'Brett S',
                    account_id: 2,
                    kills: 14,
                    assists: 3,
                    deaths: 8,
					owns_event: 1
                },
                {
                    hero_id: 86,
                    hero_name: 'Rubick',
                    event_points: 12000,
                    event_id: 25,
                    vote_count: 3,
                    player_name: 'Kyle',
                    account_id: 3,
                    kills: 2,
                    assists: 12,
                    deaths: 0,
					owns_event: 1
                },
                {
                    hero_id: 102,
                    hero_name: 'Abaddon',
                    event_points: 5000,
                    event_id: 25,
                    vote_count: 0,
                    player_name: 'Sergei',
                    account_id: 4,
                    kills: 21,
                    assists: 12,
                    deaths: 14,
					owns_event: 1
                },
                {
                    hero_id: 59,
                    hero_name: 'Huskar',
                    event_points: 200,
                    event_id: 25,
                    vote_count: 5,
                    player_name: 'Alex',
                    account_id: 5,
                    kills: 8,
                    assists: 4,
                    deaths: 2,
					owns_event: 0
                }
            ]
        }
	};

    TestProgressAnimation(data);
}

var s_TestNumber = 271;

function TestMVP2Screen() {

	var accolades = [];

	var max_accolade = 276;
	while(accolades.length < 3)
	{
		if (g_MVP_Accolade_TypeMap[s_TestNumber] != undefined)
		{
			accolades.push(s_TestNumber);
		}

		s_TestNumber = (s_TestNumber + 1) % max_accolade;
	}

	var data =
    {
		mvp2:
		{
			mvps: [
				{
					slot: 3,
					accountid: 174054,
					guildid: 4,
					heroname: 'npc_dota_hero_skeleton_king', // just for display
					// Find hero id in game\dota\scripts\npc\npc_heroes.txt
					overrideheroid: 42,
					// Find econ id in game\dota\scripts\items\items_game.txt
					overrideeconid: 13456,
					was_dire: false,
					accolades: [
						{ type: accolades[0], detail_value: 113 },
						{ type: accolades[1], detail_value: 4 },
						{ type: accolades[2], detail_value: 13 }
					]
				},
				{
					slot: 1,
					accountid: 85501829,
					guildid: 18,
					heroname: 'npc_dota_hero_sven',
					overrideheroid: 18,
					was_dire: false,
					accolades: [
						{ type: 3, detail_value: 32 }
						]
				},
				{
					slot: 2,
                    accountid: 85501006,
					guildid: 4,
					was_dire: true,
					heroname: 'npc_dota_hero_emberspirit',
					overrideheroid: 106,
					accolades: [
						{ type: 127, detail_value: 17 }
						]
				}
            ]
        }
	};

	TestProgressAnimation( data );
}


function TestAnimateCoachRating()
{
	var data =
	{
		//match_id: '123456789012345',
		match_id: '0',

		coaches_need_rating:
		[
			{
				coach_account_id: 85501006,
				coach_player_name: 'EricL',
				coach_rating: 2345
			}
			//{
			//	coach_account_id: 85501829,
			//	coach_player_name: 'Cameron',
			//	coach_rating: 5678
			//}
		]
	}

	TestProgressAnimation( data );
}


function TestAnimatePlayerMatchSurvey()
{
	var data =
	{
		match_id: '0',
		player_match_survey_progress: {}
	}

	TestProgressAnimation( data );
}


// ----------------------------------------------------------------------------
//   All Screens
// ----------------------------------------------------------------------------

function CreateProgressAnimationSequence( data )
{
	var seq = new RunSequentialActions();

	// While the actions are animating, don't allow clicking links to other screens.
	seq.actions.push( new RunFunctionAction( function () 
	{
		GetScreenLinksContainer().enabled = false;
	}));

	if ( data.mvp2 != null )
	{
		seq.actions.push( new AnimateMVP2ScreenAction( data ) );
	}

	if ( data.coaches_need_rating != null )
	{
		for (var i = 0; i < data.coaches_need_rating.length; ++i)
		{
			seq.actions.push( new AnimateCoachRatingScreenAction( data, data.coaches_need_rating[ i ] ) );
		}
	}

	if ( data.mvp_voting_progress != null )
	{
		seq.actions.push( new AnimateMVPVotingScreenAction( data ) );
	}

	if ( data.cavern_crawl_progress != null )
	{
		seq.actions.push( new AnimateCavernCrawlScreenAction( data ) );
	}

	// should be right before battle pass progress screen because it shares the "battle point progress" element
	if ( data.gauntlet_progress != null )
	{
		seq.actions.push( new AnimateGauntletProgressScreenAction( data, data.gauntlet_progress ) );
	}

	if ( data.battle_pass_progress != null )
	{
		seq.actions.push( new AnimateBattlePassScreenAction( data ) );
	}

	if ( data.rubick_arcana_progress != null )
	{
		seq.actions.push( new AnimateRubickArcanaScreenAction( data ) );
    }

	if ( data.wraith_king_arcana_progress != null )
	{
		seq.actions.push( new AnimateWraithKingArcanaScreenAction( data ) );
	}

	if ( data.hero_badge_progress != null || data.hero_relics_progress != null )
	{
		seq.actions.push( new AnimateHeroBadgeLevelScreenAction( data ) );
	}

	if ( data.frostivus_progress != null )
	{
		seq.actions.push( new AnimateFrostivusScreenAction( data ) );
	}

	if ( data.event_points_progress != null )
	{
		seq.actions.push( new AnimateEventPointsScreenAction( data ) );
	}

	if ( data.player_match_survey_progress != null )
	{
		seq.actions.push( new AnimatePlayerMatchSurveyScreenAction( data ) );
	}

	seq.actions.push( new RunFunctionAction( function ()
	{
		GetScreenLinksContainer().enabled = true;
	} ) );

	return seq;
}

function TestProgressAnimation( data )
{
	StopSkippingAhead();
	RunSingleAction( CreateProgressAnimationSequence( data ) );
}

/* Called from C++ to start the progress animation */
function StartProgressAnimation( data )
{
	ResetScreens();
	StopSkippingAhead();

	var seq = CreateProgressAnimationSequence( data );

	// Signal back to the C++ code that we're done displaying progress
	seq.actions.push( new RunFunctionAction( function ()
	{
		$.DispatchEvent( 'DOTAPostGameProgressAnimationComplete', $.GetContextPanel() );
	} ) );

	RunSingleAction( seq );
}

function HideProgress()
{
	// Just tell the C++ code that we're done by dispatching the event
	$.DispatchEvent( 'DOTAPostGameProgressAnimationComplete', $.GetContextPanel() );
}