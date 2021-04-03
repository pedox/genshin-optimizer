import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { createContext, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Badge, ButtonGroup, Dropdown, DropdownButton, Image, Nav, Tab } from 'react-bootstrap';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import DropdownToggle from 'react-bootstrap/esm/DropdownToggle';
import Row from 'react-bootstrap/Row';
import Artifact from '../Artifact/Artifact';
import WIPComponent from '../Components/WIPComponent';
import { WeaponLevelKeys } from '../Data/WeaponData';
import { deepClone } from '../Util/Util';
import Weapon from '../Weapon/Weapon';
import Character from './Character';
import CharacterDatabase from '../Database/CharacterDatabase';
import CharacterArtifactPane from './CharacterDisplay/CharacterArtifactPane';
import CharacterOverviewPane from './CharacterDisplay/CharacterOverviewPane';
import CharacterTalentPane from './CharacterDisplay/CharacterTalentPane';
import { useForceUpdate } from '../Util/ReactUtil';

export const compareAgainstEquippedContext = createContext()

const CustomMenu = React.forwardRef(
  ({ children, style, className, 'aria-labelledby': labeledBy }, ref) => {
    return (
      <div
        ref={ref}
        style={{ style, minWidth: "25rem" }}
        className={className}
        aria-labelledby={labeledBy}
      >
        <Row>
          {React.Children.toArray(children).map((child, i) => <Col key={i} xs={6}>{child}</Col>)}
        </Row>
      </div>
    );
  },
);
const initialCharacter = (characterKey) => ({
  characterKey: characterKey ?? "",//the game character this is based off
  levelKey: "L1",//combination of level and ascension
  hitMode: "hit",
  reactionMode: null,
  equippedArtifacts: {},
  artifactConditionals: [],
  baseStatOverrides: {},//overriding the baseStat
  weapon: {
    key: Object.keys(Weapon.getWeaponsOfType(Character.getWeaponTypeKey(characterKey)))[0] ?? "",
    levelKey: WeaponLevelKeys[0],
    refineIndex: 0,
    overrideMainVal: 0,
    overrideSubVal: 0,
    conditionalNum: 0,//weapon conditional
  },
  talentLevelKeys: {
    auto: 0,
    skill: 0,
    burst: 0,
  },
  autoInfused: false,
  talentConditionals: [],
  constellation: 0,
})

function characterReducer(state, action) {
  switch (action.type) {
    case "reset":
      return initialCharacter()
    case "overwrite":
      return action.character
    case "fromDB"://for equipping artifacts, that makes the changes in DB instead of in state.
      return { ...state, ...CharacterDatabase.get(state.characterKey, {}) }
    case "statOverride": {
      const { statKey, value } = action
      const baseStatOverrides = state.baseStatOverrides
      const baseStatVal = Character.getBaseStatValue(state, statKey)
      if (baseStatVal === value) {
        delete baseStatOverrides[statKey]
        return { ...state, ...baseStatOverrides }
      } else {
        baseStatOverrides[statKey] = value
        return { ...state, ...baseStatOverrides }
      }
    }
    default:
      break;
  }
  return { ...state, ...action }
}
export default function CharacterDisplayCard({ characterKey, character: propCharacter, setCharacterKey: propSetCharacterKey, footer, newBuild: propNewBuild, editable, onClose, tabName }) {
  const [character, characterDispatch] = useReducer(characterReducer, initialCharacter(characterKey))
  const [compareAgainstEquipped, setcompareAgainstEquipped] = useState(false)
  const forceUpdate = useForceUpdate()
  useEffect(() => {
    let char
    if (characterKey)
      char = { ...initialCharacter(characterKey), ...CharacterDatabase.get(characterKey, {}) }
    else if (propCharacter)
      char = { ...initialCharacter(propCharacter.characterKey), ...propCharacter }
    if (!char) return
    characterDispatch({ type: "overwrite", character: char })
  }, [characterKey, propCharacter])
  useEffect(() => {
    Promise.all([
      Character.getCharacterDataImport(),
      Weapon.getWeaponDataImport(),
      Artifact.getDataImport(),
    ]).then(forceUpdate)
  }, [forceUpdate])
  //save character to DB
  useEffect(() => CharacterDatabase.update(character), [character])

  const setCharacterKey = useCallback(
    newCKey => {
      let state = initialCharacter(newCKey)
      const char = CharacterDatabase.get(newCKey)
      if (char) state = { ...state, ...char }
      characterDispatch({ type: "overwrite", character: state })
      if (newCKey !== characterKey)
        propSetCharacterKey?.(newCKey)
    }, [characterKey, characterDispatch, propSetCharacterKey])

  const newBuild = useMemo(() => {
    const newBuild = propNewBuild && deepClone(propNewBuild)
    if (newBuild?.finalStats) {
      newBuild.finalStats.hitMode = character.hitMode;
      newBuild.finalStats.reactionMode = character.reactionMode;
    }
    return newBuild
  }, [propNewBuild, character.hitMode, character.reactionMode])

  const { levelKey, artifacts: flexArts } = character

  const equippedBuild = useMemo(() => Character.calculateBuild(character), [character])

  const HeaderIconDisplay = characterKey ? <span >
    <Image src={Character.getThumb(characterKey)} className="thumb-small my-n1 ml-n2" roundedCircle />
    <h6 className="d-inline"> {Character.getName(characterKey)} </h6>
  </span> : <span>Select a Character</span>
  const commonPaneProps = { character, newBuild, equippedBuild: !newBuild || compareAgainstEquipped ? equippedBuild : undefined, editable, characterDispatch, compareAgainstEquipped }
  if (flexArts) commonPaneProps.artifacts = flexArts//from flex
  // main CharacterDisplayCard
  return (<Card bg="darkcontent" text="lightfont" >
    <Card.Header>
      <Row>
        <Col xs={"auto"} className="mr-auto">
          {/* character selecter/display */}
          {editable ? <ButtonGroup>
            <Dropdown as={ButtonGroup}>
              <DropdownToggle as={Button}>
                {HeaderIconDisplay}
              </DropdownToggle>
              <Dropdown.Menu as={CustomMenu}>
                {Character.getAllCharacterKeys().map(charKey =>
                  <Dropdown.Item key={charKey} onClick={() => setCharacterKey(charKey)}>
                    <span >
                      <Image src={Character.getThumb(charKey)} className={`thumb-small p-0 m-n1 grad-${Character.getStar(charKey)}star`} thumbnail />
                      <h6 className="d-inline ml-2">{Character.getName(charKey)} </h6>
                    </span>
                  </Dropdown.Item>)}
              </Dropdown.Menu>
            </Dropdown>
            <DropdownButton as={ButtonGroup} disabled={!characterKey} title={
              <h6 className="d-inline">Stats Template: {Character.getlevelNames(levelKey)} </h6>
            }>
              <Dropdown.ItemText>
                <span>Select Base Stat Template</span>
              </Dropdown.ItemText>
              {Character.getlevelKeys().map(lvlKey =>
                <Dropdown.Item key={lvlKey} onClick={() => characterDispatch({ levelKey: lvlKey })}>
                  <h6 >{Character.getlevelNames(lvlKey)} </h6>
                </Dropdown.Item>)}
            </DropdownButton>
          </ButtonGroup> : <span>{HeaderIconDisplay} Lvl. {Character.getStatValueWithOverride(character, "characterLevel")}</span>}
        </Col>
        {/* Compare against new build toggle */}
        {newBuild ? <Col xs="auto">
          <ButtonGroup>
            <Button variant={compareAgainstEquipped ? "primary" : "success"} disabled={!compareAgainstEquipped} onClick={() => setcompareAgainstEquipped(false)}>
              <small>Show New artifact Stats</small>
            </Button>
            <Button variant={!compareAgainstEquipped ? "primary" : "success"} disabled={compareAgainstEquipped} onClick={() => setcompareAgainstEquipped(true)}>
              <small>Compare against equipped artifact</small>
            </Button>
          </ButtonGroup>
        </Col> : null}
        {Boolean(onClose) && <Col xs="auto" >
          <Button variant="danger" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} /></Button>
        </Col>}
      </Row>
    </Card.Header>
    {Boolean(characterKey) && <Card.Body>
      <compareAgainstEquippedContext.Provider value={compareAgainstEquipped}>
        <Tab.Container defaultActiveKey={tabName ? tabName : (newBuild ? "newartifacts" : "character")} mountOnEnter={true} unmountOnExit={true}>
          <Nav variant="pills" className="mb-2 ml-2">
            <Nav.Item >
              <Nav.Link eventKey="character">Character</Nav.Link>
            </Nav.Item>
            {newBuild ? <Nav.Item>
              <Nav.Link eventKey="newartifacts">New Artifacts</Nav.Link>
            </Nav.Item> : null}
            <Nav.Item>
              <Nav.Link eventKey="artifacts">{newBuild ? "Current Artifacts" : "Artifacts"}</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              {(process.env.NODE_ENV !== "development" && !Character.hasTalentPage(characterKey)) ?
                <WIPComponent>
                  <Nav.Link eventKey="talent" disabled>Talents <Badge variant="warning">WIP</Badge></Nav.Link>
                </WIPComponent> :
                <Nav.Link eventKey="talent">Talents</Nav.Link>
              }
            </Nav.Item>
            {!flexArts && <Nav.Item>
              <WIPComponent>
                <Nav.Link eventKey="team" disabled>Team <Badge variant="warning">WIP</Badge></Nav.Link>
              </WIPComponent>
            </Nav.Item>}
          </Nav>
          <Tab.Content>
            <Tab.Pane eventKey="character">
              <CharacterOverviewPane
                {...commonPaneProps}
              />
            </Tab.Pane>
            <Tab.Pane eventKey="artifacts" >
              <CharacterArtifactPane {...{ ...commonPaneProps, newBuild: undefined, equippedBuild, }} />
            </Tab.Pane>
            {newBuild ? <Tab.Pane eventKey="newartifacts" >
              <CharacterArtifactPane {...commonPaneProps} />
            </Tab.Pane> : null}
            <Tab.Pane eventKey="talent">
              <CharacterTalentPane {...commonPaneProps} />
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </compareAgainstEquippedContext.Provider>
    </Card.Body>}
    {footer && <Card.Footer>
      {footer}
    </Card.Footer>}
  </Card>)
}
