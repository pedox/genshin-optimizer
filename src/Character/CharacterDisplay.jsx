import { faLink, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Container, Image, Row, ToggleButton, ToggleButtonGroup } from 'react-bootstrap';
import ReactGA from 'react-ga';
import Assets from '../Assets/Assets';
import { loadFromLocalStorage, saveToLocalStorage } from '../Util/Util';
import Weapon from '../Weapon/Weapon';
import Character from './Character';
import CharacterCard from './CharacterCard';
import CharacterDatabase from '../Database/CharacterDatabase';
import { Link } from 'react-router-dom';
import { useForceUpdate } from '../Util/ReactUtil';

//lazy load the character display
const CharacterDisplayCardPromise = import('./CharacterDisplayCard');
const CharacterDisplayCard = lazy(() => CharacterDisplayCardPromise)
const toggle = {
  level: "Level",
  rarity: "Rarity",
  name: "Name"
}
const sortingFunc = {
  level: (ck) => Character.getLevel(CharacterDatabase.get(ck).levelKey),
  rarity: (ck) => Character.getStar(ck)
}

export default function CharacterDisplay(props) {
  const [charIdToEdit, setcharIdToEdit] = useState("")
  const [sortBy, setsortBy] = useState(() => Object.keys(toggle)[0])
  const [elementalFilter, setelementalFilter] = useState(() => Character.getElementalKeysWithoutPhysical())
  const [weaponFilter, setweaponFilter] = useState(() => Weapon.getWeaponTypeKeys())
  const forceUpdate = useForceUpdate()
  const scrollRef = useRef(null)
  useEffect(() => {
    ReactGA.pageview('/character')
    const saved = loadFromLocalStorage("CharacterDisplay.state")
    if (saved) {
      const { charIdToEdit, sortBy, elementalFilter, weaponFilter } = saved
      setcharIdToEdit(charIdToEdit)
      setsortBy(sortBy)
      setelementalFilter(elementalFilter)
      setweaponFilter(weaponFilter)
    }
    Character.getCharacterDataImport()?.then(forceUpdate)
    CharacterDatabase.registerListener(forceUpdate)
    return () => CharacterDatabase.unregisterListener(forceUpdate)
  }, [forceUpdate])
  useEffect(() => {
    const save = { charIdToEdit, sortBy, elementalFilter, weaponFilter }
    saveToLocalStorage("CharacterDisplay.state", save)
  }, [charIdToEdit, sortBy, elementalFilter, weaponFilter])
  const deleteCharacter = useCallback(id => {
    if (!window.confirm(`Are you sure you want to remove ${Character.getName(id)}?`)) return
    Character.remove(id)
    if (charIdToEdit === id)
      setcharIdToEdit("")
  }, [charIdToEdit, setcharIdToEdit])

  const editCharacter = useCallback(id => {
    setcharIdToEdit(id)
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 500);
  }, [setcharIdToEdit, scrollRef])

  const cancelEditCharacter = useCallback(() => setcharIdToEdit(""), [setcharIdToEdit])

  const charKeyList = CharacterDatabase.getCharacterKeyList().filter(cKey => {
    if (!elementalFilter.includes(Character.getElementalKey(cKey))) return false
    if (!weaponFilter.includes(Character.getWeaponTypeKey(cKey))) return false
    return true
  }).sort((a, b) => {
    if (sortBy === "name") {
      if (a < b) return -1;
      if (a > b) return 1;
      // names must be equal
      return 0;
    }
    if (sortBy === "level") {
      const diff = sortingFunc["level"](b) - sortingFunc["level"](a)
      if (diff) return diff
      return sortingFunc["rarity"](b) - sortingFunc["rarity"](a)
    } else {
      const diff = sortingFunc["rarity"](b) - sortingFunc["rarity"](a)
      if (diff) return diff
      return sortingFunc["level"](b) - sortingFunc["level"](a)
    }
  })
  const showEditor = Boolean(charIdToEdit)
  return <Container ref={scrollRef}>
    {/* editor/character detail display */}
    {showEditor ? <Row className="mt-2"><Col>
      <React.Suspense fallback={<span>Loading...</span>}>
        <CharacterDisplayCard editable
          setCharacterKey={editCharacter}
          characterKey={charIdToEdit}
          onClose={cancelEditCharacter}
          footer={<CharDisplayFooter onClose={cancelEditCharacter} characterKey={charIdToEdit} />}
        />
      </React.Suspense>
    </Col></Row> : null}
    <Card bg="darkcontent" text="lightfont" className="mt-2">
      <Card.Body className="p-2">
        <Row>
          <Col xs="auto">
            <ToggleButtonGroup type="checkbox" defaultValue={elementalFilter} onChange={setelementalFilter}>
              {Character.getElementalKeysWithoutPhysical().map(eleKey =>
                <ToggleButton key={eleKey} value={eleKey} variant={elementalFilter.includes(eleKey) ? "success" : "primary"} className="py-1 px-2"><h4 className="mb-0"><Image src={Assets.elements?.[eleKey]} className="inline-icon" /></h4></ToggleButton>)}
            </ToggleButtonGroup>
          </Col>
          <Col>
            <ToggleButtonGroup type="checkbox" defaultValue={weaponFilter} onChange={setweaponFilter}>
              {Weapon.getWeaponTypeKeys().map(weaponType =>
                <ToggleButton key={weaponType} value={weaponType} variant={weaponFilter.includes(weaponType) ? "success" : "primary"} className="py-1 px-2"><h4 className="mb-0"><Image src={Assets.weaponTypes?.[weaponType]} className="inline-icon" /></h4></ToggleButton>)}
            </ToggleButtonGroup>
          </Col>
          <Col xs="auto">
            <span>Sort by: </span>
            <ToggleButtonGroup type="radio" name="level" defaultValue={sortBy} onChange={setsortBy}>
              {Object.entries(toggle).map(([key, text]) =>
                <ToggleButton key={key} value={key} variant={sortBy === key ? "success" : "primary"}>{text}</ToggleButton>)}
            </ToggleButtonGroup>
          </Col>
        </Row>
      </Card.Body>
    </Card>
    <Row className="mt-2">
      {showEditor ? null : <Col lg={4} md={6} className="mb-2">
        <Card className="h-100" bg="darkcontent" text="lightfont">
          <Card.Header className="pr-2">
            <span>Add New Character</span>
          </Card.Header>
          <Card.Body className="d-flex flex-column justify-content-center">
            <Row className="d-flex flex-row justify-content-center">
              <Col xs="auto">
                <Button onClick={() => editCharacter("")}>
                  <h1><FontAwesomeIcon icon={faPlus} className="fa-fw" /></h1>
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Col>}
      {charKeyList.map(charKey =>
        <Col key={charKey} lg={4} md={6} className="mb-2">
          <CharacterCard
            cardClassName="h-100"
            characterKey={charKey}
            onDelete={deleteCharacter}
            onEdit={editCharacter}
            footer
          />
        </Col>)}
    </Row>
  </Container>
}
function CharDisplayFooter({ onClose, characterKey }) {
  return <Row>
    <Col>
      <Button variant="info" as={Link} to={{ pathname: "/flex", characterKey }}><FontAwesomeIcon icon={faLink} /> Share Character</Button>
    </Col>
    <Col xs="auto">
      <Button variant="danger" onClick={onClose}>Close</Button>
    </Col>
  </Row>
}