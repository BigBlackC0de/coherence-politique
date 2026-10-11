-- Position d'un groupe = choix le plus fréquent parmi ses élus qui ont voté (décompte nominatif, vérifiable).
-- La « position majoritaire » publiée par l'Assemblée contredit parfois ce décompte (≈ 3 % des cas) et vaut
-- « pour » quand aucun membre n'a voté (motions de censure notamment). Égalité ou aucun vote : pas de position.
UPDATE `group_votes` SET `position` = CASE
  WHEN `pour` > `contre` AND `pour` > `abstentions` THEN 'pour'
  WHEN `contre` > `pour` AND `contre` > `abstentions` THEN 'contre'
  WHEN `abstentions` > `pour` AND `abstentions` > `contre` THEN 'abstention'
  ELSE NULL
END;
